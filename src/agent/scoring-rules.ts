import type { ScrapedJob } from "../scrapers/types.js";
import {
  SALARY_FLOOR_USD,
  REMOTE_PENALTY,
  SALARY_PENALTY,
  NON_TARGET_ROLE_PENALTY,
} from "../constants.js";

export interface PenaltyResult {
  score: number;
  penalties: string[];
}

// Role titles that are NOT targets — penalized unless a target title overrides.
const NON_TARGET_PATTERNS = [
  /\bbackend\b/i,
  /\binfrastructure\b/i,
  /\bplatform\b/i,
  /\bdata engineer\b/i,
  /\bdata scientist\b/i,
  /\bml engineer\b/i,
  /\bdevops\b/i,
  /\bqa\b/i,
  /\bmobile\b/i,
  /\bstaff\b/i,
  /\bclinical\b/i,
  /\bsupport\b/i,
];

// Target titles that override a non-target penalty.
const TARGET_OVERRIDE = /\bfounding\b|\bfull.stack\b|\bfullstack\b|\bproduct engineer\b/i;

/**
 * Apply hard, non-negotiable penalties that the LLM tends to overlook.
 * Pure function: returns the adjusted score and the list of reasons applied.
 */
export function applyHardPenalties(llmScore: number, job: ScrapedJob): PenaltyResult {
  let penalty = 0;
  const reasons: string[] = [];

  // 1. Remote-only requirement.
  const loc = (job.location || "").toLowerCase();
  if (loc && !loc.includes("remote")) {
    penalty += REMOTE_PENALTY;
    reasons.push(`on-site/no-remote (-${REMOTE_PENALTY})`);
  }

  // 2. Salary floor.
  if (job.salaryMin != null && job.salaryMin > 0 && job.salaryMin < SALARY_FLOOR_USD) {
    penalty += SALARY_PENALTY;
    reasons.push(
      `salary $${(job.salaryMin / 1000).toFixed(0)}K < $${(SALARY_FLOOR_USD / 1000).toFixed(
        0
      )}K (-${SALARY_PENALTY})`
    );
  }

  // 3. Non-target role titles.
  const titleLower = job.title.toLowerCase();
  const isNonTarget = NON_TARGET_PATTERNS.some((p) => p.test(titleLower));
  const isTargetOverride = TARGET_OVERRIDE.test(titleLower);
  if (isNonTarget && !isTargetOverride) {
    penalty += NON_TARGET_ROLE_PENALTY;
    reasons.push(`non-target role (-${NON_TARGET_ROLE_PENALTY})`);
  }

  if (penalty > 0) {
    return { score: Math.max(0, llmScore - penalty), penalties: reasons };
  }

  return { score: llmScore, penalties: [] };
}
