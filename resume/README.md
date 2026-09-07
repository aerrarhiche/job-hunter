# resume/

Local, gitignored inputs that personalize the agent. Copy the example files,
fill in your own details, and the agent will score every job against them.

| File            | Purpose                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| `master.md`     | Your canonical resume (markdown). Loaded by every scoring/review call.   |
| `soul.md`       | Search preferences + hard-no filters (roles, salary, remote, industries).|
| `fullstack.md`  | Optional alternate resume variant.                                       |
| `tailored/`     | Output directory for tailored resumes generated via Telegram.            |

## Quick start

```bash
cp resume/EXAMPLE-master.md resume/master.md
cp resume/EXAMPLE-soul.md resume/soul.md
# edit both to match you, then run the agent
```

`master.md`, `soul.md`, `fullstack.md`, and `tailored/` are all gitignored so
your personal details never enter version control.
