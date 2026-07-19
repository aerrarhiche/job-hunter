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
  getLevelUpItems,
  upsertLevelUpItem,
  updateLevelUpItem,
} from "../db/client.js";
import { scrapeYC } from "../scrapers/yc.js";
import { scrapeLinkedIn } from "../scrapers/linkedin.js";
import { scrapeCustom } from "../scrapers/custom.js";
import { generateScoringReport, deepReview, generateCoverLetter } from "../agent/scorer.js";
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

// ---------------------------------------------------------------------------
// Deep Review
// ---------------------------------------------------------------------------

router.post("/api/jobs/:id/review", async (req: Request, res: Response) => {
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

    const review = await deepReview({
      title: job.title,
      company: job.company,
      description: job.description || "",
      metadata: job.metadata as any,
      scoringReport: job.scoring_report as any,
      location: job.location,
      salaryMin: job.salary_min,
    });

    res.json(review);
  } catch (err) {
    console.error("POST /api/jobs/:id/review error:", err);
    res.status(500).json({ error: "Failed to generate review" });
  }
});

// ---------------------------------------------------------------------------
// Cover Letter
// ---------------------------------------------------------------------------

router.post("/api/jobs/:id/cover-letter", async (req: Request, res: Response) => {
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

    const letter = await generateCoverLetter({
      title: job.title,
      company: job.company,
      description: job.description || "",
      metadata: job.metadata as any,
      scoringReport: job.scoring_report as any,
      location: job.location,
    });

    res.json(letter);
  } catch (err) {
    console.error("POST /api/jobs/:id/cover-letter error:", err);
    res.status(500).json({ error: "Failed to generate cover letter" });
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
// Level Up
// ---------------------------------------------------------------------------

router.get("/api/level-up", async (_req: Request, res: Response) => {
  try {
    const items = await getLevelUpItems();
    res.json(items);
  } catch (err) {
    console.error("GET /api/level-up error:", err);
    res.status(500).json({ error: "Failed to fetch level-up items" });
  }
});

router.post("/api/level-up/generate", async (_req: Request, res: Response) => {
  try {
    const { deepReview } = await import("../agent/scorer.js");
    const jobs = await getJobs({ minScore: 0, limit: 100 });
    let generated = 0;

    for (const job of jobs.jobs) {
      const review = await deepReview({
        title: job.title,
        company: job.company,
        description: job.description || "",
        metadata: (job as any).metadata,
        scoringReport: (job as any).scoring_report,
        location: job.location,
        salaryMin: (job as any).salary_min,
      });

      for (const skill of (review.skills_to_learn || [])) {
        if (!skill.name || skill.name.length < 2) continue;
        await upsertLevelUpItem(skill.name, skill.category || "concept", Number(job.id));
        generated++;
      }
    }

    const items = await getLevelUpItems();
    res.json({ generated, items });
  } catch (err) {
    console.error("POST /api/level-up/generate error:", err);
    res.status(500).json({ error: "Failed to generate level-up items" });
  }
});

router.put("/api/level-up/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { notes } = req.body;
    const item = await updateLevelUpItem(id, { notes });
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    res.json(item);
  } catch (err) {
    console.error("PUT /api/level-up/:id error:", err);
    res.status(500).json({ error: "Failed to update item" });
  }
});

// Analyze what the user said about a skill and suggest resume edits
router.post("/api/level-up/:id/analyze", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { userInput } = req.body;
    if (!userInput) { res.status(400).json({ error: "userInput is required" }); return; }

    const items = await getLevelUpItems();
    const item = items.find((i) => Number(i.id) === id);
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }

    const { loadResume, loadSoul, cfg: config } = await import("../config.js");
    const resume = loadResume();
    const soul = loadSoul();
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: config.deepseek.apiKey, baseURL: config.deepseek.baseUrl });

    const prompt = `You are a resume editor. A candidate has a skill gap: "${item.skill_name}". They wrote about their experience:

"${userInput}"

Analyze what they're telling you and suggest specific edits to their resume or preferences.

CURRENT RESUME:
${resume}

CURRENT PREFERENCES:
${soul}

RULES:
1. Determine if they already know this skill, are learning it, know a competitor, or don't know it.
2. If they know it or a competitor: suggest exactly which lines to add/modify in the resume Skills section and which experience bullets to update. Show the old text and the new text.
3. If they're learning it: suggest adding it with a "(learning)" tag.
4. If they don't know it: tell them honestly that they should learn it first.
5. NEVER invent experience. Only add skills they explicitly claim.
6. Be specific — quote exact lines from the resume to modify.

Respond with ONLY a JSON object:
{
  "interpretation": "<what the user is telling you in 1 sentence>",
  "verdict": "<knows_it | learning | knows_competitor | doesnt_know>",
  "suggested_edits": [
    {
      "file": "<master.md or soul.md>",
      "section": "<Skills or Experience or Preferences>",
      "old": "<exact text to replace, or 'ADD' if new>",
      "new": "<replacement text>"
    }
  ],
  "explanation": "<1-2 sentence explanation of what these edits do>"
}`;

    const response = await client.chat.completions.create({
      model: config.deepseek.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content || "{}";
    res.json(JSON.parse(content.trim()));
  } catch (err) {
    console.error("POST /api/level-up/:id/analyze error:", err);
    res.status(500).json({ error: "Failed to analyze" });
  }
});

// Mark item as resolved and dismiss it
router.post("/api/level-up/:id/resolve", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await updateLevelUpItem(id, { status: "mastered" });
    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/level-up/:id/resolve error:", err);
    res.status(500).json({ error: "Failed to resolve" });
  }
});

router.post("/api/level-up/suggest-resume", async (_req: Request, res: Response) => {
  try {
    const { loadResume, loadSoul } = await import("../config.js");
    const resume = loadResume();
    const soul = loadSoul();
    const items = await getLevelUpItems();

    const masteredSkills = items
      .filter((i) => ["mastered", "some_experience", "competitor_mastery"].includes(i.status))
      .map((i) => i.skill_name);

    const learningSkills = items
      .filter((i) => ["learning"].includes(i.status))
      .map((i) => i.skill_name);

    const OpenAI = (await import("openai")).default;
    const { cfg: config } = await import("../config.js");
    const client = new OpenAI({ apiKey: config.deepseek.apiKey, baseURL: config.deepseek.baseUrl });

    const prompt = `You are a resume editor. Update the candidate's resume to reflect newly acquired skills.

CURRENT RESUME:
${resume}

NEWLY MASTERED SKILLS (add these to Skills section and work into experience bullets where relevant):
${masteredSkills.join(", ") || "None"}

CURRENTLY LEARNING (add a "Learning" note if appropriate, or skip):
${learningSkills.join(", ") || "None"}

RULES:
1. Add mastered skills to the Skills section
2. Reword experience bullets to mention these skills where they naturally fit
3. NEVER invent experience — only adjust the skills list and wording
4. Keep the same structure and all existing content
5. Return the full resume in clean markdown

Respond with ONLY the updated resume markdown — no JSON wrapper, no explanation.`;

    const response = await client.chat.completions.create({
      model: config.deepseek.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 3000,
    });

    const suggested = response.choices[0]?.message?.content || resume;
    res.json({ suggested });
  } catch (err) {
    console.error("POST /api/level-up/suggest-resume error:", err);
    res.status(500).json({ error: "Failed to generate resume suggestion" });
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
