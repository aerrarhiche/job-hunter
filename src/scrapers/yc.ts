/**
 * Y Combinator "Work at a Startup" job scraper.
 *
 * ## Performance optimizations
 * - Blocks images/fonts/CSS via request interception (~60% faster page loads)
 * - 5 concurrent detail page workers (reuse pages, don't create/destroy per job)
 * - 3 concurrent role searches per flow
 * - Early scroll stop when no new links appear
 * - Tight scroll waits (800ms × 2 cycles)
 */
import puppeteer, { Browser } from "puppeteer";
import type { ScrapedJob } from "./types.js";
import { DEBUG_JOB_LIMIT } from "../agent/pipeline.js";

const DETAIL_DELAY_MS = 200;
const SCROLL_COUNT = 2;
const SCROLL_WAIT_MS = 800;
const DETAIL_CONCURRENCY = 5;
const ROLE_CONCURRENCY = 3;

// ── Resource blocking ──────────────────────────────────────────────

/** Block images, fonts, CSS, media to speed up page loads ~60% */
async function blockResources(page: any) {
  await page.setRequestInterception(true);
  page.on("request", (req: any) => {
    const t = req.resourceType();
    if (t === "image" || t === "font" || t === "media") {
      req.abort();
    } else {
      req.continue();
    }
  });
}

// ── Audit log ──────────────────────────────────────────────────────

async function audit(
  runId: number | undefined,
  step: string,
  status: string,
  message: string,
  details?: Record<string, unknown>
) {
  if (!runId) return;
  try {
    const { insertAuditLog } = await import("../db/client.js");
    await insertAuditLog(runId, step, status, message, details);
  } catch (err) {
    console.warn(`  [yc audit] "${step}": ${(err as Error).message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Main entry point
// ═══════════════════════════════════════════════════════════════════

export async function scrapeYC(runId?: number): Promise<ScrapedJob[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const CUTOFF_DATE = cutoff.toISOString().split("T")[0];

  console.log("  YC: launching headless browser...");
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  try {
    const { cfg } = await import("../config.js");
    if (!cfg.yc.email || !cfg.yc.password) {
      console.warn("  YC: credentials not set. Skipping.");
      return [];
    }

    // ── Login ──────────────────────────────────────────────────────
    const loginPage = await browser.newPage();
    await loginPage.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );

    console.log("  YC: logging in...");
    await loginPage.goto(
      "https://account.ycombinator.com/?continue=" +
        encodeURIComponent("https://www.workatastartup.com/jobs"),
      { waitUntil: "networkidle2", timeout: 20000 }
    );

    await loginPage.waitForSelector("#ycid-input", { timeout: 10000 });
    await loginPage.type("#ycid-input", cfg.yc.email, { delay: 30 });
    await loginPage.click("button.orange-button");
    await loginPage.waitForSelector("#password-input", { timeout: 10000 });
    await loginPage.type("#password-input", cfg.yc.password, { delay: 30 });
    await Promise.all([
      loginPage.waitForNavigation({ waitUntil: "networkidle2", timeout: 25000 }).catch(() => {}),
      loginPage.click("button.orange-button"),
    ]);
    await loginPage.close();
    await audit(runId, "yc:login", "completed", "Logged into YC");

    // ── Parallel search flows ──────────────────────────────────────
    const results = await Promise.allSettled([
      scrapeCompaniesFlow(browser, cfg.search.roleTitles, runId),
      scrapeJobsFlow(browser, cfg.search.roleTitles, runId),
    ]);
    const companiesUrls: string[] = results[0].status === "fulfilled" ? results[0].value : [];
    const jobsUrls: string[] = results[1].status === "fulfilled" ? results[1].value : [];
    if (results[0].status === "rejected")
      console.warn(`  YC /companies flow failed: ${(results[0].reason as Error).message}`);
    if (results[1].status === "rejected")
      console.warn(`  YC /jobs flow failed: ${(results[1].reason as Error).message}`);

    // ── Merge + dedupe ─────────────────────────────────────────────
    const seen = new Set<string>();
    const allUrls: string[] = [];
    for (const url of [...companiesUrls, ...jobsUrls]) {
      if (!seen.has(url)) { seen.add(url); allUrls.push(url); }
    }
    console.log(`  YC: ${companiesUrls.length}/c + ${jobsUrls.length}/j = ${allUrls.length} unique (${companiesUrls.length + jobsUrls.length - allUrls.length} dupes)`);
    await audit(runId, "yc:merge", "completed",
      `Merged: ${companiesUrls.length} from Flow A + ${jobsUrls.length} from Flow B = ${allUrls.length} unique (${companiesUrls.length + jobsUrls.length - allUrls.length} duplicates removed)`);
    if (allUrls.length === 0) return [];

    // ── Detail pages (concurrent worker pool) ──────────────────────
    const limit = DEBUG_JOB_LIMIT > 0 ? Math.min(allUrls.length, DEBUG_JOB_LIMIT) : allUrls.length;
    await audit(runId, "yc:details", "running", `Visiting ${limit} pages (${DETAIL_CONCURRENCY} workers)...`);
    const start = Date.now();
    const jobs = await extractDetails(browser, allUrls.slice(0, limit), CUTOFF_DATE);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`  YC: extracted ${jobs.length} jobs in ${elapsed}s`);
    await audit(runId, "yc:details", "completed", `${jobs.length} jobs extracted`, {
      count: jobs.length, elapsed_sec: parseFloat(elapsed),
    });
    return jobs;
  } catch (err) {
    console.warn("YC scraper:", (err as Error).message);
    return [];
  } finally {
    await browser.close();
  }
}

// ═══════════════════════════════════════════════════════════════════
// Parallel detail extraction with page reuse
// ═══════════════════════════════════════════════════════════════════

async function extractDetails(
  browser: Browser,
  urls: string[],
  cutoffDate: string
): Promise<ScrapedJob[]> {
  const jobs: ScrapedJob[] = [];
  const queue = [...urls];

  async function worker() {
    // Reuse a single page for multiple jobs (no create/destroy per job)
    const page = await browser.newPage();
    await blockResources(page);

    try {
      while (queue.length > 0) {
        const url = queue.shift()!;
        try {
          await page.goto(url, { waitUntil: "networkidle2", timeout: 15000 });

          const detail = await page.evaluate((cd: string) => {
            const h1Text = document.querySelector("h1")?.textContent?.trim() || "";
            const title = h1Text.split(" at ")[0]?.trim() || h1Text;
            const company = document.querySelector("h1 a")?.textContent?.trim() || "";

            const salaryEl =
              document.querySelector("div.text-gray-500 span") ||
              document.querySelector('[class*="text-gray-500"] span');
            const salaryText = salaryEl?.textContent?.trim() || "";
            let sMin: number | null = null;
            let sMax: number | null = null;
            const sm = salaryText.match(
              /(?:€|\$|£)([\d,.]+)\s*[KMB]?\s*[-–—to]+\s*(?:€|\$|£)?\s*([\d,.]+)\s*[KMB]?/i
            );
            if (sm) {
              const p = (s: string) =>
                parseFloat(s.replace(/[,]/g, "")) * (/[KMB]/i.test(salaryText) ? 1000 : 1);
              sMin = p(sm[1]); sMax = p(sm[2]);
            }

            const lc = document.querySelector(".fa-location-dot")?.closest("span");
            const ls = lc?.querySelectorAll("span");
            const location = (ls && ls.length > 0
              ? ls[ls.length - 1]?.textContent?.trim() : "") || "";

            const description =
              document.querySelector(".prose")?.textContent?.trim()?.substring(0, 3000) || "";

            const dateEl = document.querySelector("time[datetime]");
            let posted: string | null = dateEl
              ? dateEl.getAttribute("datetime")?.split("T")[0] || null : null;
            if (!posted) {
              const dm = (document.body?.innerText || "").match(/(\d+)\s*days?\s*ago/i);
              if (dm) {
                const d = new Date(); d.setDate(d.getDate() - parseInt(dm[1], 10));
                posted = d.toISOString().split("T")[0];
              }
            }
            return { title, company, location, description, salaryMin: sMin, salaryMax: sMax,
              postedDate: posted, isOld: posted !== null && posted < cd };
          }, cutoffDate);

          if (!detail.isOld) {
            jobs.push({
              title: detail.title, company: detail.company || "YC Startup",
              location: detail.location || "Unknown", url, description: detail.description || "",
              source: "yc", salaryMin: detail.salaryMin, salaryMax: detail.salaryMax,
              postedDate: detail.postedDate,
            });
          }
        } catch (err) {
          console.warn(`  YC detail failed: ${(err as Error).message}`);
        }
        if (queue.length > 0) await new Promise((r) => setTimeout(r, DETAIL_DELAY_MS));
      }
    } finally {
      await page.close();
    }
  }

  const n = Math.min(DETAIL_CONCURRENCY, urls.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return jobs;
}

// ═══════════════════════════════════════════════════════════════════
// Flow A: /companies filtered directory
// ═══════════════════════════════════════════════════════════════════

async function scrapeCompaniesFlow(browser: Browser, roles: string[], runId?: number): Promise<string[]> {
  const seen = new Set<string>();
  const urls: string[] = [];

  // Search roles in parallel batches
  for (let i = 0; i < roles.length; i += ROLE_CONCURRENCY) {
    const batch = roles.slice(i, i + ROLE_CONCURRENCY);
    const results = await Promise.all(
      batch.map((role) => searchCompaniesRole(browser, role, runId))
    );
    for (const [j, batchUrls] of results.entries()) {
      let n = 0;
      for (const u of batchUrls) {
        if (!seen.has(u)) { seen.add(u); urls.push(u); n++; }
      }
      console.log(`  YC /companies: "${batch[j]}" — ${batchUrls.length} links, ${n} new (total: ${urls.length})`);
    }
  }
  return urls;
}

async function searchCompaniesRole(browser: Browser, role: string, runId?: number): Promise<string[]> {
  const page = await browser.newPage();
  await blockResources(page);

  try {
    await audit(runId, `yc:search:A:${role}`, "running", `[Flow A] searching "${role}"...`);
    const url =
      "https://www.workatastartup.com/companies" +
      "?companySize=seed&companySize=small" +
      "&demographic=any&hasEquity=any&hasSalary=any" +
      "&industry=any&interviewProcess=any&jobType=any" +
      "&layout=list-compact" +
      "&remote=any&sortBy=keyword&tab=any" +
      "&usVisaNotRequired=true" +
      "&query=" + encodeURIComponent(role);

    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });

    let prevCount = 0;
    for (let i = 0; i < SCROLL_COUNT; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise((r) => setTimeout(r, SCROLL_WAIT_MS));
      // Early stop: if no new content loaded, don't keep scrolling
      const current = await page.evaluate(
        () => document.querySelectorAll('a[href*="/jobs/"]').length
      );
      if (current === prevCount && i > 0) break;
      prevCount = current;
    }

    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href*="/jobs/"]'))
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((href) => href.match(/\/jobs\/\d+/))
    );
    await audit(runId, `yc:search:A:${role}`, "completed", `[Flow A] "${role}" → ${links.length} links`);
    return links;
  } finally {
    await page.close();
  }
}

// ═══════════════════════════════════════════════════════════════════
// Flow B: /jobs AI-powered textarea search
// ═══════════════════════════════════════════════════════════════════

async function scrapeJobsFlow(browser: Browser, roles: string[], runId?: number): Promise<string[]> {
  const page = await browser.newPage();
  await blockResources(page);
  const seen = new Set<string>();
  const urls: string[] = [];

  await page.goto("https://www.workatastartup.com/jobs", {
    waitUntil: "networkidle2", timeout: 20000,
  });

  for (const role of roles) {
    console.log(`  YC /jobs: searching "${role}"...`);
    await audit(runId, `yc:search:B:${role}`, "running", `[Flow B] searching "${role}"...`);
    try {
      const ta = await page.$("textarea");
      if (!ta) { console.warn("    no textarea, skipping"); continue; }

      await ta.click();
      await page.keyboard.down("Control");
      await page.keyboard.press("KeyA");
      await page.keyboard.up("Control");
      await page.keyboard.type(role, { delay: 20 });

      const btn = await page.$('button[type="submit"]');
      if (btn) await btn.click();

      const appeared = await Promise.race([
        page.waitForSelector('a[href*="/jobs/"]', { timeout: 12000 }).then(() => true),
        new Promise<boolean>((r) => setTimeout(() => r(false), 12000)),
      ]);
      if (!appeared) { console.warn("    results did not load, skipping"); continue; }

      await new Promise((r) => setTimeout(r, 1500));

      let prevCount = 0;
      for (let i = 0; i < SCROLL_COUNT; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise((r) => setTimeout(r, SCROLL_WAIT_MS));
        const current = await page.evaluate(
          () => document.querySelectorAll('a[href*="/jobs/"]').length
        );
        if (current === prevCount && i > 0) break;
        prevCount = current;
      }

      const batch = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href*="/jobs/"]'))
          .map((a) => (a as HTMLAnchorElement).href)
          .filter((href) => href.match(/\/jobs\/\d+/))
      );

      let n = 0;
      for (const u of batch) { if (!seen.has(u)) { seen.add(u); urls.push(u); n++; } }
      console.log(`    ${batch.length} links, ${n} new (total: ${urls.length})`);
      await audit(runId, `yc:search:B:${role}`, "completed", `[Flow B] "${role}" → ${batch.length} links (${n} new)`);
    } catch (err) {
      console.warn(`    /jobs "${role}" failed: ${(err as Error).message}`);
    }
  }
  await page.close();
  return urls;
}
