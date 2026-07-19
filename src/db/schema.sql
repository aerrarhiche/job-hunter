-- Job Agent Schema

CREATE TABLE IF NOT EXISTS jobs (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title         TEXT NOT NULL,
  company       TEXT NOT NULL,
  location      TEXT,
  url           TEXT UNIQUE NOT NULL,
  source        TEXT NOT NULL,          -- 'linkedin', 'yc', 'wellfound', 'crunchbase'
  description   TEXT,
  salary_min    INTEGER,
  salary_max    INTEGER,
  posted_date   DATE,
  score         INTEGER,               -- 0-100 match against resume
  score_reason  TEXT,                  -- one-line explanation
  scraped_on    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata      JSONB,                 -- structured scraper data (equity, tags, flow, etc.)
  scoring_report JSONB                -- full DeepSeek scoring report (categories + summary)
);

-- Add metadata column if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='metadata') THEN
    ALTER TABLE jobs ADD COLUMN metadata JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='scoring_report') THEN
    ALTER TABLE jobs ADD COLUMN scoring_report JSONB;
  END IF;
END $$;

-- Add status column for tracking job decisions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='status') THEN
    ALTER TABLE jobs ADD COLUMN status TEXT DEFAULT 'new';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS decisions (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id        BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,         -- 'tailored', 'applied', 'skipped', 'not_a_fit', 'interviewing', 'offered'
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resume_versions (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id          BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
  file_path       TEXT NOT NULL,       -- path to tailored resume file
  changes_summary TEXT,                -- what was changed from master
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS preferences (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key           TEXT UNIQUE NOT NULL,
  value         TEXT NOT NULL,
  learned_from  TEXT,                  -- which decision taught us this
  confidence    REAL,                  -- 0-1 how confident we are
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NEW TABLES for API Dashboard
-- ============================================================

CREATE TABLE IF NOT EXISTS scrapers (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('yc', 'linkedin', 'custom')),
  url           TEXT,
  selectors     JSONB,                  -- { titleSelector, companySelector, locationSelector, urlSelector, descriptionSelector }
  active        BOOLEAN DEFAULT true,
  last_run      TIMESTAMPTZ,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scout_runs (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  total_jobs      INT DEFAULT 0,
  new_jobs        INT DEFAULT 0,
  yc_jobs         INT DEFAULT 0,
  linkedin_jobs   INT DEFAULT 0,
  custom_jobs     INT DEFAULT 0,
  status          TEXT DEFAULT 'running'
);

CREATE TABLE IF NOT EXISTS search_config (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key           TEXT UNIQUE NOT NULL,
  value         TEXT NOT NULL
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_jobs_url ON jobs(url);
CREATE INDEX IF NOT EXISTS idx_jobs_score ON jobs(score DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_scraped ON jobs(scraped_on);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_decisions_job ON decisions(job_id);

-- ============================================================
-- AUDIT LOGS for live pipeline visualization
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scout_run_id    BIGINT REFERENCES scout_runs(id) ON DELETE CASCADE,
  step            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'running',
  message         TEXT,
  details         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(scout_run_id, step)
);

CREATE INDEX IF NOT EXISTS idx_audit_run ON audit_logs(scout_run_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
