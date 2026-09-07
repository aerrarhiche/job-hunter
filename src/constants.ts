/**
 * Central source of truth for the numeric thresholds and penalties used by the
 * scoring pipeline. Keeping these here (rather than as scattered literals)
 * makes the rules auditable and prevents drift between the LLM prompt and the
 * deterministic penalty layer.
 */

export const SALARY_FLOOR_USD = 120000;
export const DEFAULT_MIN_SCORE = 70;
export const DEFAULT_API_PORT = 3000;

export const REMOTE_PENALTY = 30;
export const SALARY_PENALTY = 20;
export const NON_TARGET_ROLE_PENALTY = 25;
