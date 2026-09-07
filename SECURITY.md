# Security Policy

## Secrets model

Job Agent reads all credentials from environment variables (see `.env.example`)
and never hardcodes secrets in source. The repository is designed to be safely
public:

- `.env` is gitignored — real credentials are never committed.
- `resume/master.md`, `resume/soul.md`, and tailored resumes are personal inputs
  and are gitignored. Example placeholders (`resume/EXAMPLE-*.md`) are committed
  instead.
- API keys used at runtime (DeepSeek, Telegram, Apify, YC) are entirely your
  responsibility. Rotate any key that is ever exposed.

## Reporting a vulnerability

This is a personal, non-production tool, but security reports are still welcome.
Please **do not open a public issue** for a suspected vulnerability.

Report it privately:

1. Use GitHub's **Report a vulnerability** flow (Security → Advisories → New
   draft security advisory), or
2. Email the maintainer directly with a clear description and, if possible, a
   minimal reproduction.

Please include:

- A description of the issue and its potential impact
- Steps to reproduce
- Affected version(s)

The maintainer will acknowledge receipt as soon as possible and coordinate a
fix. There is no bug bounty program.
