# ADR-0001: Two-pass scoring pipeline

- **Status:** Accepted
- **Date:** 2026-09-07

## Context

Every scout run can surface hundreds of raw jobs. Generating a full,
category-by-category LLM report for each one is expensive (latency and API cost)
and unnecessary — most candidates are filtered out before a detailed report adds
value.

## Decision

Score in two passes (`src/agent/pipeline.ts`):

1. **Pass 1 (cheap)** — a single lightweight LLM call per job (`scoreJob`) plus
   deterministic penalties, used only to rank and drop clear misses.
2. **Pass 2 (detailed)** — a full `generateScoringReport` for the survivors, run
   with bounded concurrency. The report's `overall_score` becomes the canonical
   score stored on the job.

## Consequences

- **Positive** — token cost and wall-clock time scale with _survivors_, not the
  raw scrape volume.
- **Positive** — the fast pass is cheap enough to run over the entire corpus
  every run without a budget blowout.
- **Trade-off** — the two scores can disagree; pass 2's score is treated as
  authoritative and replaces the pass-1 estimate on insert.
