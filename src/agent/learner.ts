import {
  getJobById,
  recordDecision,
  upsertPreference,
  type PreferenceSignal,
} from "../db/client.js";

/**
 * Decision-learning. A user decision on a job ("applied", "offered", …) is
 * distilled into deterministic preference signals (source, salary band, role
 * title, company size) that are upserted into the `preferences` table with a
 * confidence score. The confidence is higher for stronger positive signals
 * (applied < interviewing < offered).
 *
 * `learnFromDecision` is pure so it can be unit-tested without a database or
 * network; `applyDecisionAndLearn` is the thin persistence wrapper used by the
 * API route.
 */

export interface DecisionInput {
  action: string;
  notes?: string | null;
}

export interface LearnableJob {
  source: string;
  title: string;
  company: string;
  salaryMin: number | null;
  salaryMax: number | null;
  location: string | null;
  metadata: Record<string, unknown> | null;
}

const POSITIVE_ACTIONS = new Set(["applied", "interviewing", "offered"]);

const ACTION_CONFIDENCE: Record<string, number> = {
  applied: 0.7,
  interviewing: 0.8,
  offered: 0.9,
};

export function learnFromDecision(decision: DecisionInput, job: LearnableJob): PreferenceSignal[] {
  if (!POSITIVE_ACTIONS.has(decision.action)) return [];

  const confidence = ACTION_CONFIDENCE[decision.action] ?? 0.7;
  const learnedFrom = decision.action;

  const signals: PreferenceSignal[] = [
    { key: "source", value: job.source, confidence, learnedFrom },
  ];

  if (job.salaryMin != null && job.salaryMax != null) {
    signals.push({
      key: "salary_band",
      value: `${Math.round(job.salaryMin / 1000)}k-${Math.round(job.salaryMax / 1000)}k`,
      confidence,
      learnedFrom,
    });
  }

  const title = job.title.trim();
  if (title) {
    signals.push({ key: "role_title", value: title, confidence, learnedFrom });
  }

  const companySize = job.metadata?.companySize;
  if (typeof companySize === "string" && companySize.trim()) {
    signals.push({ key: "company_size", value: companySize, confidence, learnedFrom });
  }

  return signals;
}

/** Record a decision and fold any learned preferences back into the store. */
export async function applyDecisionAndLearn(
  jobId: number,
  action: string,
  notes?: string
): Promise<void> {
  await recordDecision(jobId, action, notes);

  const job = await getJobById(jobId);
  if (!job) return;

  const signals = learnFromDecision(
    { action, notes },
    {
      source: job.source,
      title: job.title,
      company: job.company,
      salaryMin: job.salary_min,
      salaryMax: job.salary_max,
      location: job.location,
      metadata: job.metadata,
    }
  );

  for (const signal of signals) {
    await upsertPreference(signal);
  }
}
