# ADR-0003: Puppeteer over an API for YC scraping

- **Status:** Accepted
- **Date:** 2026-09-07

## Context

Y Combinator "Work at a Startup" requires an authenticated session to reach the
full, structured job pages (company details, equity, salary, interview process).
No public, documented API exposes this data.

## Decision

Use headless **Puppeteer** (`src/scrapers/yc.ts`) to log in and crawl two
parallel flows — `/companies` and `/jobs` — then visit detail pages with a
bounded worker pool. Requests are intercepted to block images/fonts/CSS for
speed.

## Consequences

- **Positive** — full access to the richest structured data.
- **Positive** — scraping logic is self-contained and does not depend on a paid
  third-party actor (unlike LinkedIn/Apify).
- **Trade-off** — the crawler is brittle: selectors and the login flow can change
  without notice, so they are documented as breakage points. (LinkedIn, by
  contrast, delegates to Apify to avoid this.)
