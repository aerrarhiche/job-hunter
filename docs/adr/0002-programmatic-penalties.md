# ADR-0002: Programmatic penalties on top of the LLM

- **Status:** Accepted
- **Date:** 2026-09-07

## Context

The LLM (DeepSeek) produces a 0–100 score from the resume and preferences. In
practice, the model is inconsistent at remembering hard constraints (for example,
"never show me crypto jobs" or "remote only"). Relying on the prompt alone let
clearly-unwanted jobs slip through.

## Decision

Encode the non-negotiables as deterministic, unit-tested penalties in
`src/agent/scoring-rules.ts` (`applyHardPenalties`), applied **after** the LLM
score. Rules include crypto, on-site/relocation, EU-only, large enterprise,
10+ years of experience, and non-target roles. The numeric penalties are
centralized in `src/constants.ts`.

## Consequences

- **Positive** — hard rules are enforced reliably and are easy to audit/tune
  without re-prompting.
- **Positive** — the penalty layer is pure and has unit tests.
- **Trade-off** — two sources of truth for "bad job" (prompt guidance and code);
  the code layer is authoritative for hard rules, the prompt for soft fit.
