import type { ScrapedJob } from "../scrapers/types.js";
import { insertJob, urlExists, insertAuditLog } from "../db/client.js";
import { scoreJob, generateScoringReport } from "../agent/scorer.js";
import { applyHardPenalties } from "./scoring-rules.js";

/** Debug limit — set to 0 for unlimited processing */
export const DEBUG_JOB_LIMIT = 0;

export interface ScoreAndStoreOptions {
  runId: number;
  minScore: number;
  step: string;
}

/**
 * Two-pass scoring pipeline:
 *
 *   Pass 1 (fast): Quick-score ALL jobs, apply hard penalties, filter below minScore.
 *   Pass 2 (detailed): Generate full reports for survivors in parallel.
 */
export async function scoreAndStoreJobs(
  jobs: ScrapedJob[],
  opts: ScoreAndStoreOptions
): Promise<{ stored: number; skipped: number }> {
  const step1 = `${opts.step}:pass1`;
  const step2 = `${opts.step}:pass2`;

  // ── Pass 1: Fast filter ──────────────────────────────────────
  await insertAuditLog(
    opts.runId,
    step1,
    "running",
    `Fast-scoring ${jobs.length} jobs (no research, quick filter)...`
  );

  const survivors: { job: ScrapedJob; score: number; reason: string }[] = [];
  let duplicates = 0;
  let belowThreshold = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];

    if (await urlExists(job.url)) {
      duplicates++;
      continue;
    }

    const { score: llmScore, reason } = await scoreJob({
      title: job.title,
      company: job.company,
      description: job.description,
      metadata: job.metadata,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      location: job.location,
    });

    // Apply hard programmatic penalties on top of the LLM score
    const { score, penalties } = applyHardPenalties(llmScore, job);
    if (penalties.length > 0) {
      console.log(
        `  [penalty] "${job.title}" @ ${job.company}: LLM ${llmScore} → ${score} (${penalties.join(", ")})`
      );
    }

    if (score < opts.minScore) {
      belowThreshold++;
      continue;
    }

    survivors.push({ job, score, reason });
    if (survivors.length % 10 === 0) {
      console.log(
        `  [pass1] ${survivors.length} survivors so far (${i + 1}/${jobs.length} checked)...`
      );
    }
  }

  await insertAuditLog(
    opts.runId,
    step1,
    "completed",
    `${survivors.length} passed filter (${belowThreshold} < ${opts.minScore}, ${duplicates} duplicates)`,
    { total: jobs.length, passed: survivors.length, belowThreshold, duplicates }
  );

  if (survivors.length === 0) {
    console.log("  No jobs passed the fast filter — pipeline done.");
    return { stored: 0, skipped: belowThreshold };
  }

  // ── Pass 2: Detailed reports (concurrent) ────────────────────
  await insertAuditLog(
    opts.runId,
    step2,
    "running",
    `Generating detailed reports for ${survivors.length} survivors (3 concurrent)...`
  );

  const REPORT_CONCURRENCY = 2;
  let stored = 0;

  for (let i = 0; i < survivors.length; i += REPORT_CONCURRENCY) {
    const batch = survivors.slice(i, i + REPORT_CONCURRENCY);

    await Promise.all(
      batch.map(async ({ job }) => {
        try {
          const report = await generateScoringReport({
            title: job.title,
            company: job.company,
            description: job.description,
            metadata: job.metadata,
            salaryMin: job.salaryMin,
            salaryMax: job.salaryMax,
            location: job.location,
          });

          const enrichedMetadata = {
            ...(job.metadata ?? {}),
            companySize: report.company_size || undefined,
          };

          // Reject jobs where the report generation failed (LLM returned fallback)
          if (report.summary === "Failed to generate scoring report.") {
            console.warn(
              `  [pass2] Skipping "${job.title}" @ ${job.company}: report generation failed`
            );
            return;
          }

          // Detect fake-remote: location says Remote but report mentions relocation/on-site
          const reportText =
            report.summary +
            " " +
            (report.categories || []).map((c) => c.explanation || "").join(" ");
          const relocationPatterns =
            /mandatory relocation|must relocate|required to relocate|on.site only|in.person only|no remote/i;
          const locLower = (job.location || "").toLowerCase();
          if (locLower.includes("remote") && relocationPatterns.test(reportText)) {
            console.warn(
              `  [pass2] Skipping "${job.title}" @ ${job.company}: fake remote (relocation required per report)`
            );
            return;
          }

          // Use the detailed report's score as the canonical score (more accurate than Pass 1)
          const finalScore = report.overall_score;

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
            score: finalScore,
            score_reason: report.summary,
            status: "new",
            metadata: enrichedMetadata as unknown as Record<string, unknown>,
            scoring_report: report as unknown as Record<string, unknown>,
          });

          stored++;
        } catch (err) {
          console.warn(
            `  [pass2] Report failed for "${job.title}" @ ${job.company}: ${(err as Error).message}`
          );
        }
      })
    );

    const done = Math.min(i + REPORT_CONCURRENCY, survivors.length);
    console.log(`  [pass2] ${done}/${survivors.length} detailed reports done...`);
  }

  await insertAuditLog(
    opts.runId,
    step2,
    "completed",
    `${stored} detailed reports generated and stored`,
    { stored }
  );

  return { stored, skipped: belowThreshold };
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
        console.warn(
          `  [retry] attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms: ${lastErr.message}`
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastErr ?? new Error("Retry failed");
}
