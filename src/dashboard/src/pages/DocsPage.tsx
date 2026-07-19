export default function DocsPage() {
  return (
    <div className="p-6 space-y-10 max-w-4xl mx-auto pb-20">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Documentation</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Architecture, workflows, performance, and configuration reference.
        </p>
      </div>

      {/* ================================================================ */}
      <Section title="System Architecture">
        <Diagram>{`
┌─────────────────────────────────────────────────────────────────┐
│                        JOB AGENT                                 │
│                                                                  │
│  ┌──────────────────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │ YC Scraper           │  │ LinkedIn │  │ Custom Scrapers    │ │
│  │ ┌──────────────────┐ │  │ (Apify)  │  │ (Puppeteer + AI)   │ │
│  │ │ Flow A /companies│ │  │          │  │                    │ │
│  │ │ (filtered, 3-con)│ │  │ w/ retry │  │ w/ selector cache  │ │
│  │ │ Flow B /jobs     │ │  │          │  │                    │ │
│  │ │ (AI textarea)    │ │  │          │  │                    │ │
│  │ │ 5 parallel tabs  │ │  │          │  │                    │ │
│  │ │ page reuse+block │ │  │          │  │                    │ │
│  │ └──────────────────┘ │  │          │  │                    │ │
│  └──────────┬───────────┘  └────┬─────┘  └─────────┬──────────┘ │
│             │                   │                    │            │
│             └───────────────────┼────────────────────┘            │
│                                 ▼                                 │
│                       ┌─────────────────┐                         │
│                       │  5-Filter Gate   │                        │
│                       │  EXCLUDE → OR    │                        │
│                       │  → REMOTE → LOC  │                        │
│                       │  → MIN SALARY    │                        │
│                       └────────┬────────┘                         │
│                                ▼                                  │
│                       ┌─────────────────┐                         │
│                       │  DeepSeek AI    │                         │
│                       │  Resume + Soul  │                         │
│                       │  Score 0-100    │                         │
│                       └────────┬────────┘                         │
│                                ▼                                  │
│                       ┌─────────────────┐                         │
│                       │  Score ≥ 70?    │                         │
│                       │  Yes → Store    │                         │
│                       │  No  → Drop     │                         │
│                       └────────┬────────┘                         │
│                                ▼                                  │
│                       ┌─────────────────┐                         │
│                       │  PostgreSQL     │                         │
│                       │  jobs/decisions │                         │
│                       │  audit_logs     │                         │
│                       │  search_config  │                         │
│                       └────────┬────────┘                         │
│                                │                                  │
│            ┌───────────────────┼───────────────────┐              │
│            ▼                   ▼                   ▼              │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐      │
│   │ Telegram Bot │  │ REST API     │  │ React Dashboard  │      │
│   │ /brief       │  │ :3000        │  │ :5173            │      │
│   │ /tailor      │  │              │  │ Live Pipeline    │      │
│   │ /skip        │  │              │  │ Jobs/Config/Docs │      │
│   └──────────────┘  └──────────────┘  └──────────────────┘      │
└─────────────────────────────────────────────────────────────────┘`}</Diagram>
      </Section>

      {/* ================================================================ */}
      <Section title="YC Scraper — Dual-Flow + Optimizations">
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          The YC scraper authenticates via two-step login, then runs two search flows
          in parallel. Results are merged, deduplicated, and detail pages are extracted
          using 5 concurrent workers with page reuse and resource blocking.
        </p>

        <Diagram>{`
┌──────────────────────────────────────────────────────────────────┐
│                    YC SCRAPER — OPTIMIZED                         │
│                                                                   │
│  ┌─────────┐                                                     │
│  │  Login  │  account.ycombinator.com  (#ycid-input → #password) │
│  └────┬────┘                                                     │
│       │                                                           │
│       ├────────────────────────────┬─────────────────────────────│
│       ▼                            ▼                             │
│  ┌──────────────────┐    ┌──────────────────┐                    │
│  │ Flow A           │    │ Flow B           │                    │
│  │ /companies       │    │ /jobs            │                    │
│  │ filtered URL     │    │ AI textarea      │                    │
│  │ 3 concurrent     │    │ 6 sequential     │                    │
│  │ roles per batch  │    │ (React handlers) │                    │
│  │ early scroll stop│    │ Promise.race 12s │                    │
│  │ image blocking   │    │ image blocking   │                    │
│  └────────┬─────────┘    └────────┬─────────┘                    │
│           │                       │                               │
│           └───────────┬───────────┘                               │
│                       ▼                                           │
│              ┌─────────────────┐                                  │
│              │ Merge + Dedup   │  ~270 unique job URLs            │
│              └────────┬────────┘                                  │
│                       ▼                                           │
│              ┌─────────────────┐                                  │
│              │ Detail Pages    │  5 concurrent workers            │
│              │ Page reuse      │  Reuse tabs (no create/destroy)  │
│              │ Resource block  │  Block images/fonts/media        │
│              │ 200ms pacing    │  10 pages → ~3.6s                │
│              │                 │  270 pages → ~100s               │
│              └────────┬────────┘                                  │
│                       ▼                                           │
│              ┌─────────────────┐                                  │
│              │ Extracted Data  │  Per job:                        │
│              │                 │  Title (h1 split " at ")         │
│              │                 │  Company (h1 a)                  │
│              │                 │  Salary (div.text-gray-500)      │
│              │                 │  Location (.fa-location-dot)     │
│              │                 │  Description (.prose)            │
│              │                 │  Date (<time> or "X days ago")   │
│              └─────────────────┘                                  │
└──────────────────────────────────────────────────────────────────┘`}</Diagram>

        <div className="mt-4 space-y-3">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Performance</h4>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-1.5 pr-4 font-semibold text-slate-600 dark:text-slate-300">Technique</th>
                <th className="text-left py-1.5 font-semibold text-slate-600 dark:text-slate-300">Impact</th>
              </tr>
            </thead>
            <tbody className="text-slate-500 dark:text-slate-400">
              <tr className="border-b border-slate-100 dark:border-slate-800"><td className="py-1 pr-4">5 concurrent detail workers</td><td className="py-1">~4.5× throughput</td></tr>
              <tr className="border-b border-slate-100 dark:border-slate-800"><td className="py-1 pr-4">Page reuse (no create/destroy)</td><td className="py-1">Eliminates tab overhead</td></tr>
              <tr className="border-b border-slate-100 dark:border-slate-800"><td className="py-1 pr-4">Block images/fonts/media</td><td className="py-1">~50% faster page loads</td></tr>
              <tr className="border-b border-slate-100 dark:border-slate-800"><td className="py-1 pr-4">3 concurrent role searches (Flow A)</td><td className="py-1">2× faster search phase</td></tr>
              <tr className="border-b border-slate-100 dark:border-slate-800"><td className="py-1 pr-4">Early scroll stop</td><td className="py-1">Skips wasted scrolls</td></tr>
              <tr className="border-b border-slate-100 dark:border-slate-800"><td className="py-1 pr-4">200ms inter-job pacing</td><td className="py-1">Minimal delay</td></tr>
              <tr><td className="py-1 pr-4 font-semibold">Total (270 detail pages)</td><td className="py-1 font-semibold">~100s (was ~7 min)</td></tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* ================================================================ */}
      <Section title="Filter Pipeline">
        <Diagram>{`
  Raw Job
    │
    ▼
┌─────────────────────┐
│ ① EXCLUDE Keywords  │  Config: SEARCH_EXCLUDE_KEYWORDS
│   Drop if match      │  Default: crypto,blockchain,web3,rust,go...
└─────────┬───────────┘
          │ pass
          ▼
┌─────────────────────┐
│ ② OR GATE           │  Title matches a role title?
│   Role OR Tech       │  OR description has a must-have tech?
│                      │  Config: SEARCH_ROLE_TITLES + SEARCH_MUST_HAVE
└─────────┬───────────┘
          │ pass
          ▼
┌─────────────────────┐
│ ③ Remote Only       │  Drop "on-site","in-office","in-person"
│   (if enabled)       │  Config: SEARCH_REMOTE_ONLY
└─────────┬───────────┘
          │ pass
          ▼
┌─────────────────────┐
│ ④ Location Match    │  Job location must contain one of:
│   (if configured)    │  "United States","Canada","Remote"
│                      │  Config: SEARCH_LOCATIONS
└─────────┬───────────┘
          │ pass
          ▼
┌─────────────────────┐
│ ⑤ Min Salary        │  If salary known, must be ≥ $120K
│   (if data exists)   │  Config: SEARCH_MIN_SALARY
└─────────┬───────────┘
          │ pass
          ▼
     Scored by AI`}</Diagram>
      </Section>

      {/* ================================================================ */}
      <Section title="AI Scoring (DeepSeek)">
        <Diagram>{`
  ┌──────────────────────────────────────────────┐
  │             DeepSeek Scoring Prompt           │
  │                                               │
  │  Inputs:                                      │
  │  • Resume (resume/master.md)                  │
  │  • Preferences (resume/soul.md)               │
  │  • Job title, company, description            │
  │                                               │
  │  Scoring Rubric (0-100):                      │
  │  ┌──────────────────────────────────┬──────┐  │
  │  │ Role match (Founding, Full-Stack)│ 0-30 │  │
  │  │ Tech stack overlap               │ 0-25 │  │
  │  │ Company stage (Seed/Series A)    │ 0-15 │  │
  │  │ Domain relevance                 │ 0-10 │  │
  │  │ Remote policy                    │ 0-10 │  │
  │  │ Salary ≥ $120K                   │ 0-10 │  │
  │  │ Penalties                        │ var  │  │
  │  │ • crypto/blockchain/Web3/NFTs    │ -30  │  │
  │  │ • Go/Rust/Kafka/K8s as primary   │ -20  │  │
  │  │ • On-site only                   │ -50  │  │
  │  │ • 10+ YOE required               │ -30  │  │
  │  │ • Enterprise 500+ people         │ -20  │  │
  │  └──────────────────────────────────┴──────┘  │
  │                                               │
  │  Threshold: SEARCH_MIN_SCORE (default 70)     │
  │  Below threshold → dropped, not stored        │
  └──────────────────────────────────────────────┘`}</Diagram>
      </Section>

      {/* ================================================================ */}
      <Section title="Audit Log System">
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Every pipeline step writes to audit_logs with a unique constraint per (run, step).
          The Pipeline page polls /api/audit-logs every 5s for live visualization.
        </p>

        <Diagram>{`
  DB: audit_logs(scout_run_id, step) UNIQUE
  UPSERT ensures each step has one row → no duplicates

  Typical API trigger run:
    scraper:YC Work at a Startup  running → completed
    yc:login                      completed
    yc:merge                      completed
    yc:details                    running → completed
    scoring:YC Work at a Startup  running → completed

  Typical cron (scout) run:
    pipeline          running → completed
    init              completed
    scraper:YC        running → completed
    scraper:LinkedIn  running → completed
    scraping          completed
    funding           completed
    dedupe            completed
    filter            completed
    db_check          completed
    scoring           completed
    pipeline          completed → Done`}</Diagram>
      </Section>

      {/* ================================================================ */}
      <Section title="Configuration Reference">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-2 pr-4 font-semibold text-slate-600 dark:text-slate-300">Variable</th>
                <th className="text-left py-2 pr-4 font-semibold text-slate-600 dark:text-slate-300">Default</th>
                <th className="text-left py-2 font-semibold text-slate-600 dark:text-slate-300">Description</th>
              </tr>
            </thead>
            <tbody className="text-slate-500 dark:text-slate-400">
              <Row v="SEARCH_ROLE_TITLES" d="Founding Engineer,Founding Full-Stack,..." desc="Roles to search (comma-separated). LinkedIn searches all, YC uses as query terms" />
              <Row v="SEARCH_MUST_HAVE" d="typescript,next.js,react,python,node.js,aws" desc="Tech keywords — OR gate with role titles in filter" />
              <Row v="SEARCH_EXCLUDE_KEYWORDS" d="crypto,blockchain,web3,nft,solidity,..." desc="Drop jobs containing any of these keywords" />
              <Row v="SEARCH_MIN_SCORE" d="70" desc="Only store jobs scoring ≥ this (0-100)" />
              <Row v="SEARCH_MIN_SALARY" d="120000" desc="Filter out jobs with known salary below this" />
              <Row v="SEARCH_REMOTE_ONLY" d="true" desc="Drop on-site/in-office/in-person jobs" />
              <Row v="SEARCH_LOCATIONS" d="United States,Canada,Remote" desc="Comma-separated locations to match" />
              <Row v="YC_EMAIL" d="—" desc="YC account email for login" />
              <Row v="YC_PASSWORD" d="—" desc="YC account password" />
              <Row v="DEEPSEEK_API_KEY" d="—" desc="DeepSeek API key for AI scoring" />
              <Row v="TELEGRAM_BOT_TOKEN" d="—" desc="Telegram bot token for /brief notifications" />
              <Row v="APIFY_TOKEN" d="—" desc="Apify token for LinkedIn scraping" />
              <Row v="DAILY_RUN_HOUR" d="7" desc="UTC hour for cron-triggered scout run" />
              <Row v="DAILY_RUN_MINUTE" d="0" desc="UTC minute for cron-triggered scout run" />
            </tbody>
          </table>
        </div>
      </Section>

      {/* ================================================================ */}
      <Section title="Data Sources">
        <div className="space-y-3">
          <SourceBlock
            name="YC Work at a Startup"
            url="workatastartup.com"
            method="Puppeteer (headless Chrome) + YC account login"
            filters="Company size: seed (1-10) + small (11-50), US visa not required"
            detail="5 concurrent workers with page reuse. Extracts title, company, salary, location, description, and date from each job detail page. Blocks images for speed."
          />
          <SourceBlock
            name="LinkedIn Jobs"
            url="linkedin.com/jobs"
            method="Apify API (curious_coder~linkedin-jobs-scraper) with retry"
            filters="Remote only (f_WT=2), United States, 20 results per role"
            detail="Searches all configured role titles. Results come from Apify with title, company, location, and description."
          />
          <SourceBlock
            name="Custom Scrapers"
            url="Any job board URL"
            method="Puppeteer + AI-powered selector detection (DeepSeek)"
            filters="None built-in — relies on pipeline filters"
            detail="First run uses AI to detect CSS selectors. Subsequent runs use cached selectors. Configurable via dashboard."
          />
          <SourceBlock
            name="TechCrunch Funding"
            url="techcrunch.com/category/venture/feed/"
            method="HTTP GET + RSS parsing"
            filters="None"
            detail="Parses RSS for funding announcements. Used as a signal for companies to check."
          />
        </div>
      </Section>

      {/* ================================================================ */}
      <Section title="Resilience">
        <ul className="text-sm text-slate-500 dark:text-slate-400 space-y-2 list-disc pl-5">
          <li><strong>Independent flows</strong> — Flow A (/companies) and Flow B (/jobs) run via Promise.allSettled. One failing never blocks the other.</li>
          <li><strong>Per-role timeouts</strong> — Flow B has a 12s Promise.race timeout per role. If results don't load, the role is skipped.</li>
          <li><strong>LinkedIn retry</strong> — Apify API calls wrapped with exponential backoff (2 retries, 2s base delay).</li>
          <li><strong>Per-page error handling</strong> — Detail page failures are caught individually. One bad page doesn't kill the run.</li>
          <li><strong>Audit log non-critical</strong> — Audit log failures are logged but never interrupt scraping.</li>
          <li><strong>30-day cutoff</strong> — Jobs older than 30 days are skipped (only when date is parseable — unknown dates are kept).</li>
        </ul>
      </Section>
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3 border-b border-slate-200 dark:border-slate-800 pb-2">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Diagram({ children }: { children: string }) {
  return (
    <pre className="text-[11px] leading-[1.35] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg p-4 overflow-x-auto font-mono whitespace-pre">
      {children.trim()}
    </pre>
  );
}

function Row({ v: v, d: def, desc }: { v: string; d: string; desc: string }) {
  return (
    <tr className="border-b border-slate-100 dark:border-slate-800">
      <td className="py-1.5 pr-4 font-mono text-cyan-600 dark:text-cyan-400 whitespace-nowrap">{v}</td>
      <td className="py-1.5 pr-4 text-slate-400 dark:text-slate-500 font-mono whitespace-nowrap">{def}</td>
      <td className="py-1.5">{desc}</td>
    </tr>
  );
}

function SourceBlock({ name, url, method, filters, detail }: {
  name: string; url: string; method: string; filters: string; detail: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{name}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono">{url}</span>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div><dt className="text-slate-400 dark:text-slate-500">Method</dt><dd className="text-slate-600 dark:text-slate-300">{method}</dd></div>
        <div><dt className="text-slate-400 dark:text-slate-500">Filters</dt><dd className="text-slate-600 dark:text-slate-300">{filters}</dd></div>
        <div className="sm:col-span-2"><dt className="text-slate-400 dark:text-slate-500">Detail Extraction</dt><dd className="text-slate-600 dark:text-slate-300">{detail}</dd></div>
      </dl>
    </div>
  );
}
