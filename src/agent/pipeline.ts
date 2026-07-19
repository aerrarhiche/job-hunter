import type { ScrapedJob } from "../scrapers/types.js";
import { insertJob, urlExists, insertAuditLog } from "../db/client.js";
import { scoreJob } from "../agent/scorer.js";

/** Temporary debug limit — set to 0 for unlimited */
export const DEBUG_JOB_LIMIT = 10;

export interface ScoreAndStoreOptions {
  runId: number;
  minScore: number;
  step: string;
}

/**
 * Shared scoring + storing logic used by both the cron pipeline and API triggers.
 * Returns { stored, skipped } counts.
 */
export async function scoreAndStoreJobs(
  jobs: ScrapedJob[],
  opts: ScoreAndStoreOptions
): Promise<{ stored: number; skipped: number }> {
  await insertAuditLog(opts.runId, opts.step, "running", `Scoring ${jobs.length} jobs...`);

  let stored = 0;
  let skipped = 0;
  let duplicates = 0;

  for (const job of jobs) {
    if (await urlExists(job.url)) {
      duplicates++;
      continue;
    }

    const { score, reason } = await scoreJob({
      title: job.title,
      company: job.company,
      description: job.description,
    });

    if (score < opts.minScore) {
      skipped++;
      continue;
    }

    await insertJob({
      title: job.title,
      company: job.company,
      location: job.location,
      url: job.url,
      source: job.source,
      description: job.description,
      salary_min: job.salaryMin ?? null,
      salary_max: job.salaryMax ?? null,
      posted_date: job.postedDate ?? null,
      score,
      score_reason: reason,
      status: "new",
    });

    stored++;
    if (stored % 10 === 0) console.log(`  Scored ${stored}...`);
  }

  const msg = duplicates > 0
    ? `${stored} stored, ${skipped} < ${opts.minScore}, ${duplicates} already in DB`
    : `${stored} stored, ${skipped} below ${opts.minScore}`;

  await insertAuditLog(opts.runId, opts.step, "completed", msg,
    { stored, skipped, duplicates, threshold: opts.minScore }
  );

  return { stored, skipped };
}

/**
 * Retry an async function with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastErr: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err as Error;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(`  [retry] attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms: ${lastErr.message}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastErr ?? new Error("Retry failed");
}
