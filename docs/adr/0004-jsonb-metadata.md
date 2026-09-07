# ADR-0004: JSONB for flexible job metadata

- **Status:** Accepted
- **Date:** 2026-09-07

## Context

Each scraper returns a different set of fields — YC includes equity range and
batch, LinkedIn includes seniority, custom scrapers include whatever selectors
surface, and the LLM report adds its own categories. Modeling all of these as
columns would force constant migrations.

## Decision

Store free-form data in two `JSONB` columns on `jobs`:

- `metadata` — scraper-derived structured fields (equity, tags, company size,
  flow, …).
- `scoring_report` — the full LLM report (categories, summary, company size).

Strongly-typed columns are reserved for fields the system queries and filters
on directly (`source`, `status`, `score`, `salary_min/max`, `url`, dates).

## Consequences

- **Positive** — scraper and LLM output can evolve without schema migrations.
- **Positive** — dashboards read `metadata.companySize` etc. without joins.
- **Trade-off** — JSONB fields are not individually indexed or type-checked by
  Postgres; anything that needs filtering is promoted to a real column.
