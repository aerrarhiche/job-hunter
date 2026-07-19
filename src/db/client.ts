import { Pool } from "pg";
import { cfg } from "../config.js";

export const pool = new Pool({
  host: cfg.postgres.host,
  port: cfg.postgres.port,
  database: cfg.postgres.database,
  user: cfg.postgres.user,
  password: cfg.postgres.password,
  max: 5,
});

export interface JobRow {
  id: number;
  title: string;
  company: string;
  location: string | null;
  url: string;
  source: string;
  description: string | null;
  salary_min: number | null;
  salary_max: number | null;
  posted_date: string | null;
  score: number | null;
  score_reason: string | null;
  scraped_on: string;
  status: string | null;
  metadata: Record<string, unknown> | null;
  scoring_report: Record<string, unknown> | null;
}

export interface DecisionRow {
  id: number;
  job_id: number;
  action: string;
  notes: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Scraper types & queries
// ---------------------------------------------------------------------------

export interface ScraperRow {
  id: number;
  name: string;
  type: "yc" | "linkedin" | "custom";
  url: string | null;
  selectors: Record<string, string> | null;
  active: boolean;
  last_run: string | null;
  last_error: string | null;
  created_at: string;
}

export interface ScoutRunRow {
  id: number;
  started_at: string;
  completed_at: string | null;
  total_jobs: number;
  new_jobs: number;
  yc_jobs: number;
  linkedin_jobs: number;
  custom_jobs: number;
  status: string;
}

export async function getScrapers(): Promise<ScraperRow[]> {
  const result = await pool.query("SELECT * FROM scrapers ORDER BY created_at");
  return result.rows;
}

export async function getActiveScrapers(): Promise<ScraperRow[]> {
  const result = await pool.query("SELECT * FROM scrapers WHERE active = true ORDER BY created_at");
  return result.rows;
}

export async function getScraper(id: number): Promise<ScraperRow | null> {
  const result = await pool.query("SELECT * FROM scrapers WHERE id = $1", [id]);
  return result.rows[0] || null;
}

export async function createScraper(
  name: string,
  url: string,
  type: string = "custom",
  selectors?: Record<string, string> | null
): Promise<ScraperRow> {
  const result = await pool.query(
    `INSERT INTO scrapers (name, type, url, selectors) VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, type, url, selectors ? JSON.stringify(selectors) : null]
  );
  return result.rows[0];
}

export async function updateScraper(
  id: number,
  data: Partial<Pick<ScraperRow, "active" | "selectors" | "name" | "url">>
): Promise<ScraperRow | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.active !== undefined) {
    setClauses.push(`active = $${idx++}`);
    values.push(data.active);
  }
  if (data.selectors !== undefined) {
    setClauses.push(`selectors = $${idx++}`);
    values.push(JSON.stringify(data.selectors));
  }
  if (data.name !== undefined) {
    setClauses.push(`name = $${idx++}`);
    values.push(data.name);
  }
  if (data.url !== undefined) {
    setClauses.push(`url = $${idx++}`);
    values.push(data.url);
  }

  if (setClauses.length === 0) return null;

  values.push(id);
  const result = await pool.query(
    `UPDATE scrapers SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

export async function deleteScraper(id: number): Promise<boolean> {
  const result = await pool.query("DELETE FROM scrapers WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function updateScraperRun(id: number, error?: string): Promise<void> {
  if (error) {
    await pool.query(
      "UPDATE scrapers SET last_run = NOW(), last_error = $1 WHERE id = $2",
      [error, id]
    );
  } else {
    await pool.query(
      "UPDATE scrapers SET last_run = NOW(), last_error = NULL WHERE id = $1",
      [id]
    );
  }
}

export async function updateScraperSelectors(
  id: number,
  selectors: Record<string, string>
): Promise<void> {
  await pool.query("UPDATE scrapers SET selectors = $1 WHERE id = $2", [
    JSON.stringify(selectors),
    id,
  ]);
}

// ---------------------------------------------------------------------------
// Scout run queries
// ---------------------------------------------------------------------------

export async function createScoutRun(): Promise<number> {
  const result = await pool.query(
    "INSERT INTO scout_runs (started_at) VALUES (NOW()) RETURNING id"
  );
  return result.rows[0].id;
}

export async function updateScoutRun(
  id: number,
  data: Partial<Omit<ScoutRunRow, "id">>
): Promise<void> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      setClauses.push(`${key} = $${idx++}`);
      values.push(value);
    }
  }

  if (setClauses.length === 0) return;

  values.push(id);
  await pool.query(
    `UPDATE scout_runs SET ${setClauses.join(", ")} WHERE id = $${idx}`,
    values
  );
}

export async function getScoutRuns(limit = 20): Promise<ScoutRunRow[]> {
  const result = await pool.query(
    "SELECT * FROM scout_runs ORDER BY started_at DESC LIMIT $1",
    [limit]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Search config queries
// ---------------------------------------------------------------------------

export async function getSearchConfig(): Promise<Record<string, string>> {
  const result = await pool.query("SELECT key, value FROM search_config");
  const config: Record<string, string> = {};
  for (const row of result.rows) {
    config[row.key] = row.value;
  }
  return config;
}

export async function setSearchConfig(key: string, value: string): Promise<void> {
  await pool.query(
    "INSERT INTO search_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, value]
  );
}

export async function upsertSearchConfig(updates: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(updates)) {
    await setSearchConfig(key, value);
  }
}

// ---------------------------------------------------------------------------
// Job queries
// ---------------------------------------------------------------------------

export async function insertJob(
  job: Omit<JobRow, "id" | "scraped_on" | "created_at">
): Promise<boolean> {
  try {
    await pool.query(
      `INSERT INTO jobs (title, company, location, url, source, description, salary_min, salary_max, posted_date, score, score_reason, metadata, scoring_report)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (url) DO UPDATE SET score = EXCLUDED.score, score_reason = EXCLUDED.score_reason, metadata = COALESCE(EXCLUDED.metadata, jobs.metadata), scoring_report = COALESCE(EXCLUDED.scoring_report, jobs.scoring_report)`,
      [
        job.title,
        job.company,
        job.location,
        job.url,
        job.source,
        job.description,
        job.salary_min,
        job.salary_max,
        job.posted_date,
        job.score,
        job.score_reason,
        job.metadata ? JSON.stringify(job.metadata) : null,
        job.scoring_report ? JSON.stringify(job.scoring_report) : null,
      ]
    );
    return true;
  } catch (err) {
    console.error("Failed to insert job:", err);
    return false;
  }
}

export async function getTopJobs(limit = 5): Promise<JobRow[]> {
  const result = await pool.query(
    `SELECT j.* FROM jobs j
     LEFT JOIN decisions d ON d.job_id = j.id
     WHERE d.id IS NULL
     AND j.score IS NOT NULL
     ORDER BY j.score DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function getJobById(id: number): Promise<JobRow | null> {
  const result = await pool.query("SELECT * FROM jobs WHERE id = $1", [id]);
  return result.rows[0] || null;
}

export interface JobFilters {
  source?: string;
  minScore?: number;
  status?: string;
  limit?: number;
  offset?: number;
}

export async function getJobs(filters: JobFilters = {}): Promise<{ jobs: JobRow[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (filters.source) {
    conditions.push(`j.source = $${idx++}`);
    values.push(filters.source);
  }
  if (filters.minScore !== undefined) {
    conditions.push(`j.score >= $${idx++}`);
    values.push(filters.minScore);
  }
  if (filters.status) {
    conditions.push(`j.status = $${idx++}`);
    values.push(filters.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM jobs j ${where}`,
    values
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const dataResult = await pool.query(
    `SELECT j.*, 
       CASE WHEN d.id IS NOT NULL THEN d.action ELSE NULL END as decision
     FROM jobs j
     LEFT JOIN decisions d ON d.job_id = j.id
     ${where}
     ORDER BY j.score DESC NULLS LAST, j.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...values, limit, offset]
  );

  return { jobs: dataResult.rows, total };
}

export interface JobStats {
  total: number;
  avgScore: number;
  new: number;
  applied: number;
  skipped: number;
  not_a_fit: number;
  interviewing: number;
  offered: number;
  ycHealthy: boolean;
  linkedinHealthy: boolean;
  customHealthy: boolean;
}

export async function getJobStats(): Promise<JobStats> {
  const [countResult, scoreResult, statusResult, scraperResult] = await Promise.all([
    pool.query("SELECT COUNT(*) as total FROM jobs"),
    pool.query("SELECT ROUND(AVG(score), 1) as avg_score FROM jobs WHERE score IS NOT NULL"),
    pool.query("SELECT COALESCE(status, 'new') as status, COUNT(*) as count FROM jobs GROUP BY status"),
    pool.query("SELECT type, last_run, last_error FROM scrapers WHERE active = true"),
  ]);

  const total = parseInt(countResult.rows[0].total, 10);
  const avgScore = parseFloat(scoreResult.rows[0]?.avg_score ?? "0");

  const statusCounts: Record<string, number> = { new: 0, applied: 0, skipped: 0, not_a_fit: 0, interviewing: 0, offered: 0 };
  for (const row of statusResult.rows) {
    statusCounts[row.status] = parseInt(row.count, 10);
  }

  const now = Date.now();
  const oneHourMs = 60 * 60 * 1000;
  const scraperHealth: Record<string, boolean> = {};
  for (const row of scraperResult.rows) {
    const lastRun = row.last_run ? new Date(row.last_run).getTime() : 0;
    scraperHealth[row.type] = now - lastRun < 24 * oneHourMs && !row.last_error;
  }

  return {
    total,
    avgScore,
    new: statusCounts.new ?? 0,
    applied: statusCounts.applied ?? 0,
    skipped: statusCounts.skipped ?? 0,
    not_a_fit: statusCounts.not_a_fit ?? 0,
    interviewing: statusCounts.interviewing ?? 0,
    offered: statusCounts.offered ?? 0,
    ycHealthy: scraperHealth.yc ?? false,
    linkedinHealthy: scraperHealth.linkedin ?? false,
    customHealthy: scraperHealth.custom ?? false,
  };
}

export async function recordDecision(
  jobId: number,
  action: string,
  notes?: string
): Promise<void> {
  await pool.query(
    "INSERT INTO decisions (job_id, action, notes) VALUES ($1, $2, $3)",
    [jobId, action, notes || null]
  );

  // Also update job status for dashboard tracking
  if (["applied", "skipped", "not_a_fit", "interviewing", "offered"].includes(action)) {
    await pool.query("UPDATE jobs SET status = $1 WHERE id = $2", [action, jobId]);
  }
}

export async function recordResumeVersion(
  jobId: number,
  filePath: string,
  summary: string
): Promise<void> {
  await pool.query(
    "INSERT INTO resume_versions (job_id, file_path, changes_summary) VALUES ($1, $2, $3)",
    [jobId, filePath, summary]
  );
}

export async function urlExists(url: string): Promise<boolean> {
  const result = await pool.query("SELECT 1 FROM jobs WHERE url = $1", [url]);
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

export async function seedDefaults(): Promise<void> {
  // Seed default scrapers if none exist
  const scraperCount = await pool.query("SELECT COUNT(*) as c FROM scrapers");
  if (parseInt(scraperCount.rows[0].c, 10) === 0) {
    await pool.query(
      `INSERT INTO scrapers (name, type, url) VALUES
       ('YC Work at a Startup', 'yc', 'https://www.workatastartup.com/jobs'),
       ('LinkedIn Jobs', 'linkedin', 'https://www.linkedin.com/jobs/')`
    );
    console.log("Seeded default scrapers (YC, LinkedIn)");
  }

  // Seed default search config from env vars
  const configCount = await pool.query("SELECT COUNT(*) as c FROM search_config");
  if (parseInt(configCount.rows[0].c, 10) === 0) {
    await upsertSearchConfig({
      role_titles: cfg.search.roleTitles.join(","),
      must_have: cfg.search.mustHave.join(","),
      exclude_keywords: cfg.search.excludeKeywords.join(","),
      locations: cfg.search.locations.join(","),
      min_salary: String(cfg.search.minSalary),
      score_threshold: String(cfg.search.minScore),
      remote_only: String(cfg.search.remoteOnly),
    });
    console.log("Seeded default search config from env vars");
  }
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export async function insertAuditLog(
  scoutRunId: number,
  step: string,
  status: string,
  message: string,
  details?: Record<string, unknown>
): Promise<void> {
  await pool.query(
    `INSERT INTO audit_logs (scout_run_id, step, status, message, details)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (scout_run_id, step)
     DO UPDATE SET status = EXCLUDED.status, message = EXCLUDED.message, details = EXCLUDED.details`,
    [scoutRunId, step, status, message, details ? JSON.stringify(details) : null]
  );
}

export async function getAuditLogs(scoutRunId: number): Promise<Array<{
  id: number;
  scout_run_id: number;
  step: string;
  status: string;
  message: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}>> {
  const result = await pool.query(
    "SELECT * FROM audit_logs WHERE scout_run_id = $1 ORDER BY created_at ASC",
    [scoutRunId]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Level Up — skills gap tracker
// ---------------------------------------------------------------------------

export interface LevelUpItem {
  id: number;
  skill_name: string;
  category: string | null;
  source_job_ids: number[] | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function getLevelUpItems(): Promise<LevelUpItem[]> {
  const result = await pool.query("SELECT * FROM level_up_items ORDER BY status = 'to_learn' DESC, id ASC");
  return result.rows;
}

export async function upsertLevelUpItem(
  skillName: string,
  category: string,
  sourceJobId: number
): Promise<void> {
  await pool.query(
    `INSERT INTO level_up_items (skill_name, category, source_job_ids)
     VALUES ($1, $2, ARRAY[$3::bigint])
     ON CONFLICT (skill_name) DO UPDATE
     SET source_job_ids = (
       SELECT array_agg(DISTINCT x) FROM unnest(level_up_items.source_job_ids || ARRAY[$3::bigint]) AS x
     ),
     updated_at = NOW()`,
    [skillName, category, sourceJobId]
  );
}

export async function updateLevelUpItem(
  id: number,
  updates: { status?: string; notes?: string }
): Promise<LevelUpItem | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (updates.status !== undefined) {
    setClauses.push(`status = $${idx++}`);
    values.push(updates.status);
  }
  if (updates.notes !== undefined) {
    setClauses.push(`notes = $${idx++}`);
    values.push(updates.notes);
  }

  if (setClauses.length === 0) return null;
  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const result = await pool.query(
    `UPDATE level_up_items SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}
