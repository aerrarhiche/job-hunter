import { CronJob } from "cron";
import { cfg } from "./config.js";
import {
  pool,
  insertJob,
  urlExists,
  getActiveScrapers,
  createScoutRun,
  updateScoutRun,
  updateScraperRun,
  getSearchConfig,
  seedDefaults,
  insertAuditLog,
} from "./db/client.js";
import { scoreJob } from "./agent/scorer.js";
import { scoreAndStoreJobs } from "./agent/pipeline.js";
import { scrapeYC } from "./scrapers/yc.js";
import { scrapeLinkedIn } from "./scrapers/linkedin.js";
import { scrapeCustom } from "./scrapers/custom.js";
import { checkTechCrunchFunding } from "./scrapers/crunchbase.js";
import { startBot, sendDailyBrief } from "./telegram/bot.js";
import { createServer } from "./api/server.js";
import type { ScrapedJob } from "./scrapers/types.js";
import type { ScraperRow } from "./db/client.js";

// ---------------------------------------------------------------------------
// Search config overrides from DB
// ---------------------------------------------------------------------------

interface SearchOverrides {
  excludeKeywords: string[];
  mustHave: string[];
  roleTitles: string[];
  locations: string[];
  minSalary: number;
  minScore: number;
  remoteOnly: boolean;
}

async function loadSearchConfig(): Promise<SearchOverrides> {
  const dbConfig = await getSearchConfig();

  return {
    excludeKeywords: dbConfig.exclude_keywords
      ? dbConfig.exclude_keywords.split(",").map((k) => k.trim().toLowerCase())
      : cfg.search.excludeKeywords,
    mustHave: dbConfig.must_have
      ? dbConfig.must_have.split(",").map((k) => k.trim().toLowerCase())
      : cfg.search.mustHave,
    roleTitles: dbConfig.role_titles
      ? dbConfig.role_titles.split(",").map((r) => r.trim())
      : cfg.search.roleTitles,
    locations: dbConfig.locations
      ? dbConfig.locations.split(",").map((l) => l.trim())
      : cfg.search.locations,
    minSalary: dbConfig.min_salary
      ? parseInt(dbConfig.min_salary, 10)
      : cfg.search.minSalary,
    minScore: dbConfig.score_threshold
      ? parseInt(dbConfig.score_threshold, 10)
      : cfg.search.minScore,
    remoteOnly: dbConfig.remote_only
      ? dbConfig.remote_only === "true"
      : cfg.search.remoteOnly,
  };
}

// ---------------------------------------------------------------------------
// Run a single scraper and return its jobs
// ---------------------------------------------------------------------------

async function runScraper(
  scraper: ScraperRow,
  runId: number
): Promise<ScrapedJob[]> {
  const step = `scraper:${scraper.name}`;
  await insertAuditLog(runId, step, "running", `Starting ${scraper.name}...`);

  try {
    let jobs: ScrapedJob[] = [];

    switch (scraper.type) {
      case "yc":
        jobs = await scrapeYC(runId);
        break;
      case "linkedin":
        jobs = await scrapeLinkedIn(runId);
        break;
      case "custom":
        jobs = await scrapeCustom(scraper);
        break;
    }

    await updateScraperRun(scraper.id);
    await insertAuditLog(runId, step, "completed", `${scraper.name}: ${jobs.length} jobs found`, { count: jobs.length });
    return jobs;
  } catch (err) {
    const msg = (err as Error).message;
    console.warn(`  ${scraper.name}: ${msg}`);
    await updateScraperRun(scraper.id, msg);
    await insertAuditLog(runId, step, "failed", msg);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main scout orchestration
// ---------------------------------------------------------------------------

async function scout(): Promise<void> {
  const startedAt = new Date().toISOString();
  console.log(`\n=== Job Scout Run: ${startedAt} ===\n`);

  const runId = await createScoutRun();
  await insertAuditLog(runId, "pipeline", "running", "Scout pipeline started");

  const searchConfig = await loadSearchConfig();
  console.log(`Roles: ${searchConfig.roleTitles.join(", ")}`);
  console.log(`Must have: ${searchConfig.mustHave.join(", ")}`);
  console.log(`Min score: ${searchConfig.minScore}`);
  console.log(`Excluding: ${searchConfig.excludeKeywords.join(", ")}`);

  // 1. Read active scrapers
  const scrapers = await getActiveScrapers();
  console.log(`Active scrapers: ${scrapers.map((s) => `${s.name} (${s.type})`).join(", ")}`);
  await insertAuditLog(runId, "init", "completed", `${scrapers.length} active scrapers`, {
    scrapers: scrapers.map(s => s.name),
  });

  // 2. Run each scraper
  const allJobs: ScrapedJob[] = [];
  let ycJobs = 0;
  let linkedinJobs = 0;
  let customJobs = 0;

  for (const scraper of scrapers) {
    console.log(`\nRunning: ${scraper.name}...`);
    const jobs = await runScraper(scraper, runId);
    console.log(`  ${scraper.name}: ${jobs.length} jobs`);
    allJobs.push(...jobs);

    if (scraper.type === "yc") ycJobs += jobs.length;
    else if (scraper.type === "linkedin") linkedinJobs += jobs.length;
    else customJobs += jobs.length;
  }

  await insertAuditLog(runId, "scraping", "completed", `Total: ${allJobs.length} raw jobs (YC: ${ycJobs}, LI: ${linkedinJobs}, Custom: ${customJobs})`, {
    total: allJobs.length, yc: ycJobs, linkedin: linkedinJobs, custom: customJobs,
  });

  // 3. TechCrunch funding check
  console.log("\nChecking TechCrunch for new funding...");
  await insertAuditLog(runId, "funding", "running", "Checking TechCrunch...");
  const fundingRounds = await checkTechCrunchFunding();
  console.log(`  Found ${fundingRounds.length} recent funding events`);
  await insertAuditLog(runId, "funding", "completed", `${fundingRounds.length} funding events`, { count: fundingRounds.length });

  // 4. Merge and dedupe
  const seen = new Set<string>();
  const unique = allJobs.filter((j) => {
    if (seen.has(j.url) || !j.title || !j.company) return false;
    seen.add(j.url);
    return true;
  });
  console.log(`\nTotal unique jobs: ${unique.length}`);
  await insertAuditLog(runId, "dedupe", "completed", `${unique.length} unique jobs`);

  // 5. Filter by hard criteria
  const filtered = unique.filter((j) => {
    const text = `${j.title} ${j.description}`.toLowerCase();
    const titleLower = j.title.toLowerCase();
    const locLower = (j.location || "").toLowerCase();

    if (searchConfig.excludeKeywords.some((kw) => text.includes(kw))) return false;

    const matchesRole = searchConfig.roleTitles.some((role) =>
      titleLower.includes(role.toLowerCase())
    );
    const matchesTech = searchConfig.mustHave.some((tech) =>
      text.includes(tech)
    );
    if (!matchesRole && !matchesTech) return false;

    if (searchConfig.remoteOnly && locLower && locLower !== "unknown") {
      if (/\bon.site\b|\bin.office\b|\bin.person\b/i.test(locLower)) return false;
    }

    if (searchConfig.locations.length > 0 && locLower && locLower !== "unknown") {
      const matchesLocation = searchConfig.locations.some(
        (l) => locLower.includes(l.toLowerCase()) || l.toLowerCase().includes(locLower)
      );
      if (!matchesLocation) return false;
    }

    if (j.salaryMin != null && searchConfig.minSalary > 0 && j.salaryMin < searchConfig.minSalary) {
      return false;
    }

    return true;
  });
  console.log(`After hard filters: ${filtered.length}`);
  await insertAuditLog(runId, "filter", "completed", `${filtered.length} passed filters (${unique.length - filtered.length} dropped)`);

  // 6. Dedupe against DB
  let newCount = 0;
  for (const job of filtered) {
    if (await urlExists(job.url)) continue;
    newCount++;
  }
  console.log(`New jobs (not in DB): ${newCount}`);
  await insertAuditLog(runId, "db_check", "completed", `${newCount} new jobs not yet in database`);

  // 7. Score and insert (only keep score >= minScore)
  const { stored: scored, skipped } = await scoreAndStoreJobs(filtered, {
    runId,
    minScore: searchConfig.minScore,
    step: "scoring",
  });

  console.log(`\nScored and stored: ${scored} jobs (${skipped} below threshold of ${searchConfig.minScore})`);
  await insertAuditLog(runId, "scoring", "completed", `${scored} stored, ${skipped} below ${searchConfig.minScore}`, {
    stored: scored, skipped, threshold: searchConfig.minScore,
  });

  // 8. Show funding alerts
  if (fundingRounds.length > 0) {
    console.log("\nRecent funding rounds (check these companies for job postings):");
    fundingRounds.forEach((r) => console.log(`  ${r.company}: ${r.url}`));
  }

  // 9. Update scout run record
  await updateScoutRun(runId, {
    completed_at: new Date().toISOString(),
    total_jobs: allJobs.length,
    new_jobs: scored,
    yc_jobs: ycJobs,
    linkedin_jobs: linkedinJobs,
    custom_jobs: customJobs,
    status: "completed",
  });

  await insertAuditLog(runId, "pipeline", "completed", `Done: ${scored} jobs stored from ${allJobs.length} raw`);

  // 10. Send brief
  await sendDailyBrief();

  console.log("\n=== Scout Complete ===\n");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("Job Agent starting...");
  console.log(`Using DeepSeek @ ${cfg.deepseek.baseUrl}`);
  console.log(`Daily run: ${cfg.schedule.hour}:${String(cfg.schedule.minute).padStart(2, "0")} UTC`);
  console.log(`Min score threshold: ${cfg.search.minScore}`);
  console.log(`Excluding keywords: ${cfg.search.excludeKeywords.join(", ")}`);
  console.log(`Target roles: ${cfg.search.roleTitles.join(", ")}`);

  try {
    await pool.query("SELECT 1");
    console.log("Postgres connected");
  } catch (err) {
    console.error("Postgres connection failed:", err);
    process.exit(1);
  }

  await seedDefaults();

  if (process.argv.includes("--once")) {
    await scout();
    await pool.end();
    process.exit(0);
  }

  const app = createServer();
  const PORT = parseInt(process.env.API_PORT || "3000", 10);
  app.listen(PORT, () => {
    console.log(`API server listening on http://0.0.0.0:${PORT}`);
  });

  try {
    startBot();
  } catch (err) {
    console.warn("Telegram bot failed to start:", err);
  }

  const cronTime = `${cfg.schedule.minute} ${cfg.schedule.hour} * * *`;
  console.log(`Scheduling: ${cronTime}`);

  const job = new CronJob(cronTime, scout);
  job.start();

  console.log("Job Agent ready. Waiting for scheduled run...\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
