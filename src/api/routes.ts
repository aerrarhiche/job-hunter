import { Router, Request, Response } from "express";
import {
  pool,
  getJobStats,
  getJobs,
  getJobById,
  recordDecision,
  getScrapers,
  getScraper,
  createScraper,
  updateScraper,
  deleteScraper,
  getSearchConfig,
  upsertSearchConfig,
  getScoutRuns,
  updateScraperRun,
  getAuditLogs,
  createScoutRun,
  updateScoutRun,
} from "../db/client.js";
import { scrapeYC } from "../scrapers/yc.js";
import { scrapeLinkedIn } from "../scrapers/linkedin.js";
import { scrapeCustom } from "../scrapers/custom.js";
import { generateScoringReport } from "../agent/scorer.js";
import { cfg } from "../config.js";

const router = Router();

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

router.get("/api/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await getJobStats();
    res.json(stats);
  } catch (err) {
    console.error("GET /api/stats error:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

router.get("/api/jobs", async (req: Request, res: Response) => {
  try {
    const {
      source,
      minScore,
      status,
      limit,
      offset,
    } = req.query;

    const result = await getJobs({
      source: source as string | undefined,
      minScore: minScore ? parseInt(minScore as string, 10) : undefined,
      status: status as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json(result);
  } catch (err) {
    console.error("GET /api/jobs error:", err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

router.get("/api/jobs/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid job id" });
      return;
    }

    const job = await getJobById(id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    // Also fetch decisions for this job
    const decisions = await pool.query(
      "SELECT * FROM decisions WHERE job_id = $1 ORDER BY created_at DESC",
      [id]
    );

    res.json({ ...job, decisions: decisions.rows });
  } catch (err) {
    console.error("GET /api/jobs/:id error:", err);
    res.status(500).json({ error: "Failed to fetch job" });
  }
});

// ---------------------------------------------------------------------------
// Scoring Report
// ---------------------------------------------------------------------------

router.get("/api/jobs/:id/report", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid job id" });
      return;
    }

    const job = await getJobById(id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    // Return stored report if available (instant), otherwise generate fresh
    if (job.scoring_report) {
      res.json(job.scoring_report);
      return;
    }

    const report = await generateScoringReport({
      title: job.title,
      company: job.company,
      description: job.description || "",
      metadata: job.metadata as any,
      salaryMin: job.salary_min,
      salaryMax: job.salary_max,
      location: job.location,
    });

    res.json(report);
  } catch (err) {
    console.error("GET /api/jobs/:id/report error:", err);
    res.status(500).json({ error: "Failed to generate scoring report" });
  }
});

router.post("/api/jobs/:id/decide", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid job id" });
      return;
    }

    const { action, notes } = req.body;
    const validActions = ["applied", "skipped", "not_a_fit", "interviewing", "offered"];
    if (!validActions.includes(action)) {
      res.status(400).json({ error: `Invalid action. Must be one of: ${validActions.join(", ")}` });
      return;
    }

    await recordDecision(id, action, notes);
    res.json({ success: true, action });
  } catch (err) {
    console.error("POST /api/jobs/:id/decide error:", err);
    res.status(500).json({ error: "Failed to record decision" });
  }
});

// ---------------------------------------------------------------------------
// Scrapers
// ---------------------------------------------------------------------------

router.get("/api/scrapers", async (_req: Request, res: Response) => {
  try {
    const scrapers = await getScrapers();
    res.json(scrapers);
  } catch (err) {
    console.error("GET /api/scrapers error:", err);
    res.status(500).json({ error: "Failed to fetch scrapers" });
  }
});

router.put("/api/scrapers/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid scraper id" });
      return;
    }

    const { active, selectors, name, url } = req.body;
    const updated = await updateScraper(id, { active, selectors, name, url });
    if (!updated) {
      res.status(404).json({ error: "Scraper not found or no fields to update" });
      return;
    }

    res.json(updated);
  } catch (err) {
    console.error("PUT /api/scrapers/:id error:", err);
    res.status(500).json({ error: "Failed to update scraper" });
  }
});

router.post("/api/scrapers", async (req: Request, res: Response) => {
  try {
    const { name, url, selectors } = req.body;
    if (!name || !url) {
      res.status(400).json({ error: "name and url are required" });
      return;
    }

    const scraper = await createScraper(name, url, "custom", selectors || null);
    res.status(201).json(scraper);
  } catch (err) {
    console.error("POST /api/scrapers error:", err);
    res.status(500).json({ error: "Failed to create scraper" });
  }
});

router.delete("/api/scrapers/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid scraper id" });
      return;
    }

    const deleted = await deleteScraper(id);
    if (!deleted) {
      res.status(404).json({ error: "Scraper not found" });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/scrapers/:id error:", err);
    res.status(500).json({ error: "Failed to delete scraper" });
  }
});

router.post("/api/scrapers/:id/trigger", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid scraper id" });
      return;
    }

    const scraper = await getScraper(id);
    if (!scraper) {
      res.status(404).json({ error: "Scraper not found" });
      return;
    }

    const runId = await createScoutRun();
    const searchConfig = await getSearchConfig();
    const minScore = searchConfig.score_threshold
      ? parseInt(searchConfig.score_threshold, 10)
      : 70;

    res.json({ message: `Triggered scraper "${scraper.name}"`, scraperId: id, runId });

    runSingleScraper(scraper, runId, minScore).then(async ({ found, stored, skipped }) => {
      await updateScoutRun(runId, {
        completed_at: new Date().toISOString(),
        total_jobs: found,
        new_jobs: stored,
        yc_jobs: scraper.type === "yc" ? found : 0,
        linkedin_jobs: scraper.type === "linkedin" ? found : 0,
        custom_jobs: scraper.type === "custom" ? found : 0,
        status: "completed",
      });
    }).catch(async (err) => {
      console.error(`Scraper trigger ${id} failed:`, err);
      await updateScoutRun(runId, { completed_at: new Date().toISOString(), status: "failed" });
    });
  } catch (err) {
    console.error("POST /api/scrapers/:id/trigger error:", err);
    res.status(500).json({ error: "Failed to trigger scraper" });
  }
});

router.post("/api/scrapers/trigger-all", async (_req: Request, res: Response) => {
  try {
    const scrapers = await getScrapers();
    const active = scrapers.filter((s) => s.active);

    const runId = await createScoutRun();
    const searchConfig = await getSearchConfig();
    const minScore = searchConfig.score_threshold
      ? parseInt(searchConfig.score_threshold, 10)
      : 70;

    res.json({ message: `Triggered ${active.length} scrapers`, count: active.length, runId });

    // Run all scrapers in parallel under one scout_run
    Promise.all(active.map((s) => runSingleScraper(s, runId, minScore)))
      .then(async (results) => {
        const total = results.reduce((a, r) => a + r.found, 0);
        const stored = results.reduce((a, r) => a + r.stored, 0);
        const yc = results.filter((_, i) => active[i].type === "yc").reduce((a, r) => a + r.found, 0);
        const li = results.filter((_, i) => active[i].type === "linkedin").reduce((a, r) => a + r.found, 0);
        const custom = results.filter((_, i) => active[i].type === "custom").reduce((a, r) => a + r.found, 0);
        await updateScoutRun(runId, {
          completed_at: new Date().toISOString(),
          total_jobs: total,
          new_jobs: stored,
          yc_jobs: yc,
          linkedin_jobs: li,
          custom_jobs: custom,
          status: "completed",
        });
      })
      .catch(async (err) => {
        console.error("Trigger-all failed:", err);
        await updateScoutRun(runId, { completed_at: new Date().toISOString(), status: "failed" });
      });
  } catch (err) {
    console.error("POST /api/scrapers/trigger-all error:", err);
    res.status(500).json({ error: "Failed to trigger scrapers" });
  }
});

// ---------------------------------------------------------------------------
// Search Config
// ---------------------------------------------------------------------------

// Map between dashboard camelCase and DB snake_case
const CONFIG_MAP: Array<{ dash: string; db: string; type: "array" | "number" | "boolean" }> = [
  { dash: "roleTitles",      db: "role_titles",      type: "array" },
  { dash: "excludeKeywords", db: "exclude_keywords", type: "array" },
  { dash: "mustHave",        db: "must_have",        type: "array" },
  { dash: "locations",       db: "locations",        type: "array" },
  { dash: "minSalary",       db: "min_salary",       type: "number" },
  { dash: "remoteOnly",      db: "remote_only",      type: "boolean" },
];

router.get("/api/search-config", async (_req: Request, res: Response) => {
  try {
    const raw = await getSearchConfig();

    // Convert DB key-value strings → dashboard-friendly format
    const dash: Record<string, unknown> = {};
    for (const { dash: dk, db: dbk, type } of CONFIG_MAP) {
      const val = raw[dbk];
      if (val === undefined || val === null) continue;

      switch (type) {
        case "array":
          dash[dk] = val.split(",").map((s: string) => s.trim()).filter(Boolean);
          break;
        case "number":
          dash[dk] = parseInt(val, 10) || 0;
          break;
        case "boolean":
          dash[dk] = val === "true";
          break;
      }
    }

    res.json(dash);
  } catch (err) {
    console.error("GET /api/search-config error:", err);
    res.status(500).json({ error: "Failed to fetch search config" });
  }
});

router.put("/api/search-config", async (req: Request, res: Response) => {
  try {
    const body = req.body || {};

    // Convert dashboard camelCase → DB key-value strings
    const dbUpdates: Record<string, string> = {};
    for (const { dash: dk, db: dbk, type } of CONFIG_MAP) {
      const val = body[dk];
      if (val === undefined) continue;

      switch (type) {
        case "array":
          dbUpdates[dbk] = Array.isArray(val) ? val.join(",") : String(val);
          break;
        case "number":
          dbUpdates[dbk] = String(val);
          break;
        case "boolean":
          dbUpdates[dbk] = val ? "true" : "false";
          break;
      }
    }

    if (Object.keys(dbUpdates).length === 0) {
      res.status(400).json({ error: "Request body is empty" });
      return;
    }

    await upsertSearchConfig(dbUpdates);

    // Return the updated config in dashboard format
    const raw = await getSearchConfig();
    const dash: Record<string, unknown> = {};
    for (const { dash: dk, db: dbk, type } of CONFIG_MAP) {
      const val = raw[dbk];
      if (val === undefined || val === null) continue;
      switch (type) {
        case "array":
          dash[dk] = val.split(",").map((s: string) => s.trim()).filter(Boolean);
          break;
        case "number":
          dash[dk] = parseInt(val, 10) || 0;
          break;
        case "boolean":
          dash[dk] = val === "true";
          break;
      }
    }

    res.json(dash);
  } catch (err) {
    console.error("PUT /api/search-config error:", err);
    res.status(500).json({ error: "Failed to update search config" });
  }
});

// ---------------------------------------------------------------------------
// Scout Runs
// ---------------------------------------------------------------------------

router.get("/api/runs", async (_req: Request, res: Response) => {
  try {
    const runs = await getScoutRuns(20);
    res.json(runs);
  } catch (err) {
    console.error("GET /api/runs error:", err);
    res.status(500).json({ error: "Failed to fetch scout runs" });
  }
});

// ---------------------------------------------------------------------------
// Audit Logs
// ---------------------------------------------------------------------------

router.get("/api/audit-logs", async (req: Request, res: Response) => {
  try {
    const runId = req.query.runId ? parseInt(req.query.runId as string, 10) : undefined;
    if (!runId) {
      // Return logs for the latest run
      const runs = await getScoutRuns(1);
      if (runs.length === 0) return res.json([]);
      const logs = await getAuditLogs(runs[0].id);
      return res.json(logs);
    }
    const logs = await getAuditLogs(runId);
    res.json(logs);
  } catch (err) {
    console.error("GET /api/audit-logs error:", err);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runSingleScraper(
  scraper: import("../db/client.js").ScraperRow,
  runId: number,
  minScore: number
): Promise<{ found: number; stored: number; skipped: number }> {
  console.log(`Triggering scraper: ${scraper.name} (type=${scraper.type})`);

  const step = `scraper:${scraper.name}`;
  const { insertAuditLog: logAudit } = await import("../db/client.js");
  await logAudit(runId, step, "running", `Starting ${scraper.name}...`);

  try {
    let jobs: import("../scrapers/types.js").ScrapedJob[] = [];

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

    console.log(`  ${scraper.name}: got ${jobs.length} jobs`);

    const { scoreAndStoreJobs } = await import("../agent/pipeline.js");
    const result = await scoreAndStoreJobs(jobs, { runId, minScore, step: `scoring:${scraper.name}` });

    await updateScraperRun(scraper.id);
    await logAudit(runId, step, "completed", `${scraper.name}: ${jobs.length} found, ${result.stored} stored (${result.skipped} < ${minScore})`);
    return { found: jobs.length, ...result };
  } catch (err) {
    const msg = (err as Error).message;
    await updateScraperRun(scraper.id, msg);
    await logAudit(runId, step, "failed", msg);
    console.error(`  ${scraper.name}: failed – ${msg}`);
    return { found: 0, stored: 0, skipped: 0 };
  }
}

export { router };
