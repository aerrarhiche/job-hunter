/**
 * Y Combinator "Work at a Startup" job scraper.
 *
 * ## Extracted data
 * - Full structured page: company about, role description, interview process
 * - YC batch info (S25, W25, etc.)
 * - Equity range, salary range
 * - Employment type, visa sponsorship, experience level
 * - Flow tracking: Flow A (/companies) vs Flow B (/jobs)
 *
 * ## Performance
 * - Blocks images/fonts/CSS via request interception (~60% faster page loads)
 * - 5 concurrent detail page workers (reuse pages)
 * - 3 concurrent role searches per flow
 * - Early scroll stop when no new links appear
 */
import puppeteer, { Browser } from "puppeteer";
import type { ScrapedJob, ScrapedJobMetadata } from "./types.js";
import { DEBUG_JOB_LIMIT } from "../agent/pipeline.js";

const DETAIL_DELAY_MS = 200;
const SCROLL_COUNT = 2;
const SCROLL_WAIT_MS = 800;
const DETAIL_CONCURRENCY = 5;
const ROLE_CONCURRENCY = 3;

// ── Resource blocking ──────────────────────────────────────────────

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

// ── Tagged URL (tracks which flow found it) ────────────────────────

interface TaggedUrl {
  url: string;
  /** "companies_search" (Flow A) or "jobs_search" (Flow B) */
  flow: string;
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
    const companiesUrls: TaggedUrl[] =
      results[0].status === "fulfilled" ? results[0].value : [];
    const jobsUrls: TaggedUrl[] =
      results[1].status === "fulfilled" ? results[1].value : [];
    if (results[0].status === "rejected")
      console.warn(`  YC /companies flow failed: ${(results[0].reason as Error).message}`);
    if (results[1].status === "rejected")
      console.warn(`  YC /jobs flow failed: ${(results[1].reason as Error).message}`);

    // ── Merge + dedupe (preserve flow info) ────────────────────────
    const seen = new Set<string>();
    const allTagged: TaggedUrl[] = [];
    for (const t of [...companiesUrls, ...jobsUrls]) {
      if (!seen.has(t.url)) {
        seen.add(t.url);
        allTagged.push(t);
      }
    }
    console.log(
      `  YC: ${companiesUrls.length}/c + ${jobsUrls.length}/j = ${allTagged.length} unique`
    );
    await audit(runId, "yc:merge", "completed",
      `Merged: ${companiesUrls.length} from Flow A + ${jobsUrls.length} from Flow B = ${allTagged.length} unique`
    );
    if (allTagged.length === 0) return [];

    // ── Detail pages (concurrent worker pool) ──────────────────────
    const limit =
      DEBUG_JOB_LIMIT > 0
        ? Math.min(allTagged.length, DEBUG_JOB_LIMIT)
        : allTagged.length;
    await audit(runId, "yc:details", "running",
      `Visiting ${limit} pages (${DETAIL_CONCURRENCY} workers)...`
    );
    const start = Date.now();
    const jobs = await extractDetails(browser, allTagged.slice(0, limit), CUTOFF_DATE);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`  YC: extracted ${jobs.length} jobs in ${elapsed}s`);
    await audit(runId, "yc:details", "completed", `${jobs.length} jobs extracted`, {
      count: jobs.length,
      elapsed_sec: parseFloat(elapsed),
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
  taggedUrls: TaggedUrl[],
  cutoffDate: string
): Promise<ScrapedJob[]> {
  const jobs: ScrapedJob[] = [];
  const queue = [...taggedUrls];

  async function worker() {
    const page = await browser.newPage();
    await blockResources(page);

    try {
      while (queue.length > 0) {
        const tagged = queue.shift()!;
        try {
          await page.goto(tagged.url, {
            waitUntil: "networkidle2",
            timeout: 15000,
          });

          const detail = await page.evaluate(
            (cd: string, flow: string) => {
              // ── Title & Company ──────────────────────────────────
              const h1Text =
                document.querySelector("h1")?.textContent?.trim() || "";
              const title = h1Text.split(" at ")[0]?.trim() || h1Text;
              const company =
                document.querySelector("h1 a")?.textContent?.trim() || "";

              // YC batch (e.g. "(S25)" in the title)
              const batchMatch = h1Text.match(/\(([SW]\d{2})\)/);
              const ycBatch = batchMatch ? batchMatch[1] : undefined;

              // ── Salary & Equity ──────────────────────────────────
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
                  parseFloat(s.replace(/[,]/g, "")) *
                  (/[KMB]/i.test(salaryText) ? 1000 : 1);
                sMin = p(sm[1]);
                sMax = p(sm[2]);
              }

              // Equity
              let eMin: number | null = null;
              let eMax: number | null = null;
              const eqMatch = salaryText.match(
                /([\d.]+)%\s*[-–—to]+\s*([\d.]+)%/
              );
              if (eqMatch) {
                eMin = parseFloat(eqMatch[1]);
                eMax = parseFloat(eqMatch[2]);
              }

              // ── Location ─────────────────────────────────────────
              const lc = document
                .querySelector(".fa-location-dot")
                ?.closest("span");
              const ls = lc?.querySelectorAll("span");
              const location =
                (ls && ls.length > 0
                  ? ls[ls.length - 1]?.textContent?.trim()
                  : "") || "";

              // ── Tags (employment type, visa, experience) ─────────
              const tags: string[] = [];
              const tagSpans = document.querySelectorAll(
                "span.inline-flex.items-center.gap-1\\.5"
              );
              tagSpans.forEach((el) => {
                const t = el.textContent?.trim();
                if (t && t.length < 50) tags.push(t);
              });

              const employmentType = tags.find((t) =>
                /full.time|part.time|contract|intern/i.test(t)
              );
              const visaSponsorship = tags.some((t) =>
                /sponsor/i.test(t)
              );
              const expMatch = tags
                .find((t) => /(\d+)\+?\s*years?/i.test(t))
                ?.match(/(\d+)\+?\s*years?/i);
              const experienceLevel = expMatch ? expMatch[0] : undefined;

              // ── Structured descriptions ───────────────────────────
              const proseSections = document.querySelectorAll(".prose");
              let companyDescription = "";
              let roleDescription = "";
              let interviewProcess = "";

              // YC detail page sections are: "About X", "About the role", "Interview Process"
              const allProse = Array.from(proseSections);
              for (let i = 0; i < allProse.length; i++) {
                const text = allProse[i].textContent?.trim() || "";
                // Find the nearest preceding heading
                const prevHeading = allProse[i]
                  .closest("div")
                  ?.previousElementSibling?.querySelector("span")
                  ?.textContent?.trim() || "";
                if (
                  prevHeading.toLowerCase().includes("about") &&
                  !prevHeading.toLowerCase().includes("role")
                ) {
                  companyDescription = text;
                } else if (prevHeading.toLowerCase().includes("role")) {
                  roleDescription = text;
                } else if (
                  prevHeading.toLowerCase().includes("interview")
                ) {
                  interviewProcess = text;
                }
              }

              // Fallback: if headings didn't map, use position
              if (!companyDescription && allProse[1]) {
                companyDescription = allProse[1].textContent?.trim() || "";
              }
              if (!roleDescription && allProse[2]) {
                roleDescription = allProse[2].textContent?.trim() || "";
              }
              if (!interviewProcess && allProse[3]) {
                interviewProcess = allProse[3].textContent?.trim() || "";
              }

              // Use role description as primary, fall back to first prose
              const description =
                (roleDescription ||
                  allProse[0]?.textContent?.trim() ||
                  "")
                  .substring(0, 4000);

              // ── Posted date ──────────────────────────────────────
              const dateEl = document.querySelector("time[datetime]");
              let posted: string | null = dateEl
                ? dateEl.getAttribute("datetime")?.split("T")[0] || null
                : null;
              if (!posted) {
                const dm = (document.body?.innerText || "").match(
                  /(\d+)\s*days?\s*ago/i
                );
                if (dm) {
                  const d = new Date();
                  d.setDate(d.getDate() - parseInt(dm[1], 10));
                  posted = d.toISOString().split("T")[0];
                }
              }

              return {
                title,
                company,
                location,
                description,
                salaryMin: sMin,
                salaryMax: sMax,
                postedDate: posted,
                isOld: posted !== null && posted < cd,
                metadata: {
                  scraperFlow: flow,
                  ycBatch,
                  equityMin: eMin,
                  equityMax: eMax,
                  employmentType,
                  visaSponsorship: visaSponsorship || undefined,
                  experienceLevel,
                  companyDescription: companyDescription?.substring(0, 2000),
                  roleDescription: roleDescription?.substring(0, 4000),
                  interviewProcess: interviewProcess?.substring(0, 2000),
                  tags: tags.length > 0 ? tags : undefined,
                } as ScrapedJobMetadata,
              };
            },
            cutoffDate,
            tagged.flow
          );

          if (!detail.isOld) {
            jobs.push({
              title: detail.title,
              company: detail.company || "YC Startup",
              location: detail.location || "Unknown",
              url: tagged.url,
              description: detail.description || "",
              source: "yc",
              salaryMin: detail.salaryMin,
              salaryMax: detail.salaryMax,
              postedDate: detail.postedDate,
              metadata: detail.metadata,
            });
          }
        } catch (err) {
          console.warn(`  YC detail failed: ${(err as Error).message}`);
        }
        if (queue.length > 0)
          await new Promise((r) => setTimeout(r, DETAIL_DELAY_MS));
      }
    } finally {
      await page.close();
    }
  }

  const n = Math.min(DETAIL_CONCURRENCY, taggedUrls.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return jobs;
}

// ═══════════════════════════════════════════════════════════════════
// Flow A: /companies filtered directory
// ═══════════════════════════════════════════════════════════════════

async function scrapeCompaniesFlow(
  browser: Browser,
  roles: string[],
  runId?: number
): Promise<TaggedUrl[]> {
  const seen = new Set<string>();
  const urls: TaggedUrl[] = [];

  for (let i = 0; i < roles.length; i += ROLE_CONCURRENCY) {
    const batch = roles.slice(i, i + ROLE_CONCURRENCY);
    const results = await Promise.all(
      batch.map((role) => searchCompaniesRole(browser, role, runId))
    );
    for (const [j, batchUrls] of results.entries()) {
      let n = 0;
      for (const u of batchUrls) {
        if (!seen.has(u.url)) {
          seen.add(u.url);
          urls.push(u);
          n++;
        }
      }
      console.log(
        `  YC /companies: "${batch[j]}" — ${batchUrls.length} links, ${n} new (total: ${urls.length})`
      );
    }
  }
  return urls;
}

async function searchCompaniesRole(
  browser: Browser,
  role: string,
  runId?: number
): Promise<TaggedUrl[]> {
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

    await audit(
      runId,
      `yc:search:A:${role}`,
      "completed",
      `[Flow A] "${role}" → ${links.length} links`
    );

    return links.map((url) => ({ url, flow: "companies_search" }));
  } finally {
    await page.close();
  }
}

// ═══════════════════════════════════════════════════════════════════
// Flow B: /jobs AI-powered textarea search
// ═══════════════════════════════════════════════════════════════════

async function scrapeJobsFlow(
  browser: Browser,
  roles: string[],
  runId?: number
): Promise<TaggedUrl[]> {
  const page = await browser.newPage();
  await blockResources(page);
  const seen = new Set<string>();
  const urls: TaggedUrl[] = [];

  await page.goto("https://www.workatastartup.com/jobs", {
    waitUntil: "networkidle2",
    timeout: 20000,
  });

  for (const role of roles) {
    console.log(`  YC /jobs: searching "${role}"...`);
    await audit(
      runId,
      `yc:search:B:${role}`,
      "running",
      `[Flow B] searching "${role}"...`
    );
    try {
      const ta = await page.$("textarea");
      if (!ta) {
        console.warn("    no textarea, skipping");
        continue;
      }

      await ta.click();
      await page.keyboard.down("Control");
      await page.keyboard.press("KeyA");
      await page.keyboard.up("Control");
      await page.keyboard.type(role, { delay: 20 });

      const btn = await page.$('button[type="submit"]');
      if (btn) await btn.click();

      const appeared = await Promise.race([
        page
          .waitForSelector('a[href*="/jobs/"]', { timeout: 12000 })
          .then(() => true),
        new Promise<boolean>((r) => setTimeout(() => r(false), 12000)),
      ]);
      if (!appeared) {
        console.warn("    results did not load, skipping");
        continue;
      }

      await new Promise((r) => setTimeout(r, 1500));

      let prevCount = 0;
      for (let i = 0; i < SCROLL_COUNT; i++) {
        await page.evaluate(() =>
          window.scrollTo(0, document.body.scrollHeight)
        );
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
      for (const u of batch) {
        if (!seen.has(u)) {
          seen.add(u);
          urls.push({ url: u, flow: "jobs_search" });
          n++;
        }
      }
      console.log(`    ${batch.length} links, ${n} new (total: ${urls.length})`);
      await audit(
        runId,
        `yc:search:B:${role}`,
        "completed",
        `[Flow B] "${role}" → ${batch.length} links (${n} new)`
      );
    } catch (err) {
      console.warn(`    /jobs "${role}" failed: ${(err as Error).message}`);
    }
  }
  await page.close();
  return urls;
}
