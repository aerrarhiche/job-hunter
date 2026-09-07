import type { ScrapedJob } from "../scrapers/types.js";
import type { ScraperRow } from "../db/client.js";
import { insertAuditLog, updateScraperRun } from "../db/client.js";
import { scrapeYC } from "../scrapers/yc.js";
import { scrapeLinkedIn } from "../scrapers/linkedin.js";
import { scrapeCustom } from "../scrapers/custom.js";

/** Dispatch to the correct scraper implementation for a scraper row. */
export async function scrapeWithType(scraper: ScraperRow, runId: number): Promise<ScrapedJob[]> {
  switch (scraper.type) {
    case "yc":
      return scrapeYC(runId);
    case "linkedin":
      return scrapeLinkedIn(runId);
    case "custom":
      return scrapeCustom(scraper);
    default:
      return [];
  }
}

/** Scrape a single scraper, record its outcome, and return the raw jobs. */
export async function runScraper(scraper: ScraperRow, runId: number): Promise<ScrapedJob[]> {
  const step = `scraper:${scraper.name}`;
  await insertAuditLog(runId, step, "running", `Starting ${scraper.name}...`);

  try {
    const jobs = await scrapeWithType(scraper, runId);
    await updateScraperRun(scraper.id);
    await insertAuditLog(runId, step, "completed", `${scraper.name}: ${jobs.length} jobs found`, {
      count: jobs.length,
    });
    return jobs;
  } catch (err) {
    const msg = (err as Error).message;
    console.warn(`  ${scraper.name}: ${msg}`);
    await updateScraperRun(scraper.id, msg);
    await insertAuditLog(runId, step, "failed", msg);
    return [];
  }
}

/** Scrape, score, and store jobs for a single scraper (dashboard trigger). */
export async function runSingleScraper(
  scraper: ScraperRow,
  runId: number,
  minScore: number
): Promise<{ found: number; stored: number; skipped: number }> {
  console.log(`Triggering scraper: ${scraper.name} (type=${scraper.type})`);

  const step = `scraper:${scraper.name}`;
  await insertAuditLog(runId, step, "running", `Starting ${scraper.name}...`);

  try {
    const jobs = await scrapeWithType(scraper, runId);
    console.log(`  ${scraper.name}: got ${jobs.length} jobs`);

    const { scoreAndStoreJobs } = await import("../agent/pipeline.js");
    const result = await scoreAndStoreJobs(jobs, {
      runId,
      minScore,
      step: `scoring:${scraper.name}`,
    });

    await updateScraperRun(scraper.id);
    await insertAuditLog(
      runId,
      step,
      "completed",
      `${scraper.name}: ${jobs.length} found, ${result.stored} stored (${result.skipped} < ${minScore})`
    );
    return { found: jobs.length, ...result };
  } catch (err) {
    const msg = (err as Error).message;
    await updateScraperRun(scraper.id, msg);
    await insertAuditLog(runId, step, "failed", msg);
    console.error(`  ${scraper.name}: failed – ${msg}`);
    return { found: 0, stored: 0, skipped: 0 };
  }
}
