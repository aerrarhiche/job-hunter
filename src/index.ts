import { CronJob } from "cron";
import { cfg } from "./config.js";
import { logger } from "./logger.js";
import {
  pool,
  getExistingUrls,
  getActiveScrapers,
  createScoutRun,
  updateScoutRun,
  getSearchConfig,
  seedDefaults,
  insertAuditLog,
} from "./db/client.js";
import { scoreAndStoreJobs } from "./agent/pipeline.js";
import { filterJobs, dedupeJobs, type SearchConfig } from "./agent/filter.js";
import { DEFAULT_API_PORT, GRACEFUL_SHUTDOWN_TIMEOUT_MS } from "./constants.js";
import { runScraper } from "./scout/run-scraper.js";
import { checkTechCrunchFunding } from "./scrapers/techcrunch.js";
import { startBot, sendDailyBrief } from "./telegram/bot.js";
import { createServer } from "./api/server.js";
import type { ScrapedJob } from "./scrapers/types.js";

// ---------------------------------------------------------------------------
// Search config overrides from DB
// ---------------------------------------------------------------------------

async function loadSearchConfig(): Promise<SearchConfig> {
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
    minSalary: dbConfig.min_salary ? parseInt(dbConfig.min_salary, 10) : cfg.search.minSalary,
    minScore: dbConfig.score_threshold
      ? parseInt(dbConfig.score_threshold, 10)
      : cfg.search.minScore,
    remoteOnly: dbConfig.remote_only ? dbConfig.remote_only === "true" : cfg.search.remoteOnly,
  };
}

// ---------------------------------------------------------------------------
// Main scout orchestration
// ---------------------------------------------------------------------------

async function scout(): Promise<void> {
  const startedAt = new Date().toISOString();
  logger.info(`\n=== Job Scout Run: ${startedAt} ===\n`);

  const runId = await createScoutRun();
  await insertAuditLog(runId, "pipeline", "running", "Scout pipeline started");

  const searchConfig = await loadSearchConfig();
  logger.info(`Roles: ${searchConfig.roleTitles.join(", ")}`);
  logger.info(`Must have: ${searchConfig.mustHave.join(", ")}`);
  logger.info(`Min score: ${searchConfig.minScore}`);
  logger.info(`Excluding: ${searchConfig.excludeKeywords.join(", ")}`);

  // 1. Read active scrapers
  const scrapers = await getActiveScrapers();
  logger.info(`Active scrapers: ${scrapers.map((s) => `${s.name} (${s.type})`).join(", ")}`);
  await insertAuditLog(runId, "init", "completed", `${scrapers.length} active scrapers`, {
    scrapers: scrapers.map((s) => s.name),
  });

  // 2. Run each scraper
  const allJobs: ScrapedJob[] = [];
  let ycJobs = 0;
  let linkedinJobs = 0;
  let customJobs = 0;

  for (const scraper of scrapers) {
    logger.info(`\nRunning: ${scraper.name}...`);
    const jobs = await runScraper(scraper, runId);
    logger.info(`  ${scraper.name}: ${jobs.length} jobs`);
    allJobs.push(...jobs);

    if (scraper.type === "yc") ycJobs += jobs.length;
    else if (scraper.type === "linkedin") linkedinJobs += jobs.length;
    else customJobs += jobs.length;
  }

  await insertAuditLog(
    runId,
    "scraping",
    "completed",
    `Total: ${allJobs.length} raw jobs (YC: ${ycJobs}, LI: ${linkedinJobs}, Custom: ${customJobs})`,
    {
      total: allJobs.length,
      yc: ycJobs,
      linkedin: linkedinJobs,
      custom: customJobs,
    }
  );

  // 3. TechCrunch funding check
  logger.info("\nChecking TechCrunch for new funding...");
  await insertAuditLog(runId, "funding", "running", "Checking TechCrunch...");
  const fundingRounds = await checkTechCrunchFunding();
  logger.info(`  Found ${fundingRounds.length} recent funding events`);
  await insertAuditLog(runId, "funding", "completed", `${fundingRounds.length} funding events`, {
    count: fundingRounds.length,
  });

  // 4. Merge and dedupe
  const unique = dedupeJobs(allJobs);
  logger.info(`\nTotal unique jobs: ${unique.length}`);
  await insertAuditLog(runId, "dedupe", "completed", `${unique.length} unique jobs`);

  // 5. Filter by hard criteria
  const filtered = filterJobs(unique, searchConfig);
  logger.info(`After hard filters: ${filtered.length}`);
  await insertAuditLog(
    runId,
    "filter",
    "completed",
    `${filtered.length} passed filters (${unique.length - filtered.length} dropped)`
  );

  // 6. Dedupe against DB
  const existingUrls = await getExistingUrls(filtered.map((j) => j.url));
  const newCount = filtered.filter((j) => !existingUrls.has(j.url)).length;
  logger.info(`New jobs (not in DB): ${newCount}`);
  await insertAuditLog(runId, "db_check", "completed", `${newCount} new jobs not yet in database`);

  // 7. Score and insert (only keep score >= minScore)
  const { stored: scored, skipped } = await scoreAndStoreJobs(filtered, {
    runId,
    minScore: searchConfig.minScore,
    step: "scoring",
  });

  logger.info(
    `\nScored and stored: ${scored} jobs (${skipped} below threshold of ${searchConfig.minScore})`
  );
  await insertAuditLog(
    runId,
    "scoring",
    "completed",
    `${scored} stored, ${skipped} below ${searchConfig.minScore}`,
    {
      stored: scored,
      skipped,
      threshold: searchConfig.minScore,
    }
  );

  // 8. Show funding alerts
  if (fundingRounds.length > 0) {
    logger.info("\nRecent funding rounds (check these companies for job postings):");
    fundingRounds.forEach((r) => logger.info(`  ${r.company}: ${r.url}`));
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

  await insertAuditLog(
    runId,
    "pipeline",
    "completed",
    `Done: ${scored} jobs stored from ${allJobs.length} raw`
  );

  // 10. Send brief
  await sendDailyBrief();

  logger.info("\n=== Scout Complete ===\n");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!cfg.deepseek.apiKey) {
    logger.error("DEEPSEEK_API_KEY is required. Add it to .env (see .env.example).");
    process.exit(1);
  }
  logger.info("Job Agent starting...");
  logger.info(`Using DeepSeek @ ${cfg.deepseek.baseUrl}`);
  logger.info(
    `Daily run: ${cfg.schedule.hour}:${String(cfg.schedule.minute).padStart(2, "0")} UTC`
  );
  logger.info(`Min score threshold: ${cfg.search.minScore}`);
  logger.info(`Excluding keywords: ${cfg.search.excludeKeywords.join(", ")}`);
  logger.info(`Target roles: ${cfg.search.roleTitles.join(", ")}`);

  try {
    await pool.query("SELECT 1");
    logger.info("Postgres connected");
  } catch (err) {
    logger.error({ err }, "Postgres connection failed");
    process.exit(1);
  }

  await seedDefaults();

  if (process.argv.includes("--once")) {
    await scout();
    await pool.end();
    process.exit(0);
  }

  const app = createServer();
  const PORT = parseInt(process.env.API_PORT || String(DEFAULT_API_PORT), 10);
  const server = app.listen(PORT, () => {
    logger.info(`API server listening on http://0.0.0.0:${PORT}`);
  });

  let bot: ReturnType<typeof startBot> = null;
  try {
    bot = startBot();
  } catch (err) {
    logger.warn({ err }, "Telegram bot failed to start");
  }

  const cronTime = `${cfg.schedule.minute} ${cfg.schedule.hour} * * *`;
  logger.info(`Scheduling: ${cronTime}`);

  const job = new CronJob(cronTime, scout);
  job.start();

  logger.info("Job Agent ready. Waiting for scheduled run...");

  // Graceful shutdown: stop cron, stop Telegram polling, close HTTP server,
  // then drain the Postgres pool before exiting.
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down gracefully...");

    job.stop();
    if (bot) void bot.stopPolling();

    const forceExit = setTimeout(() => {
      logger.warn("Forced shutdown after timeout");
      process.exit(1);
    }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close(() => {
      void pool.end().then(() => {
        clearTimeout(forceExit);
        logger.info("Shutdown complete");
        process.exit(0);
      });
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal error");
  process.exit(1);
});
