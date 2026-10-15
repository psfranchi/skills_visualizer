# Recommended skills (software development)

Skills teach **when/how** to do a recurring workflow. Agents encode **roles**. Keep skills short; put stack facts in the overlay (`stack-commands`), not in every skill.

## Already in this template

| Skill | Purpose |
|-------|---------|
| `explore-codebase` | Spawn explore for search/research; save builder context |
| `adopt-base` | Install this template into an app |
| `fill-stack-overlay` | Detect stack → `overlays/<stack>/` |
| `ship-checklist` | Pre-merge gate |
| `pr-review` | Structured review output (critical / suggestion / nit) |
| `debug-incident` | Reproduce → hypothesize → minimal fix via builder → regression test |
| `add-test` | Smallest failing/locking test in the project’s style |
| `migrate-schema` | Expand/contract, rollback, backfill checklist (commands from overlay) |

Communication “caveman” / status compression is **in-repo** (`20-communication` + agent files) — not a separate skill and **not** an external pack to install.

## High-value skills to add (custom or adopt)

Create these when the pain shows up twice; don’t invent a zoo up front.

| Skill idea | When it pays off |
|------------|------------------|
| **`refactor-safe`** | Rename/extract only with characterization tests + no behavior change |
| **`release-notes`** | Summarize commits/PR for changelog from git log + user-facing deltas |
| **`dependency-bump`** | Upgrade one dep: lockfile, changelog skim, run tests, note breaks |
| **`oncall-runbook`** | Product-specific: logs, health checks, rollback commands (per app) |
| **`api-contract`** | OpenAPI/JSON schema change + consumer impact checklist |

## Hooks vs skills

Project hooks (`.cursor/hooks.json` + `.cursor/hooks/*`) **enforce** dangerous-git gates and secret scans (failClosed). Skills do not replace them.

For ship complements: use Cursor skills **`review-bugbot`** / **`review-security`** (`/review-bugbot`, `/review-security`) after the in-repo `reviewer` / `security` / `verifier` crew — optional, not required.

Optional MCP / external tools (GitHub, tickets, observability): see [`docs/mcp.md`](mcp.md). Do not bake project servers into `.cursor/mcp.json` by default.

## Cursor / ecosystem skills worth adopting

- Stack-specific commands (your overlay’s `stack-commands` — always; also under `.cursor/skills/stack-commands/`)
- Official Cursor skills you already use (e.g. create-rule, create-skill) — keep **personal** if not shared
- `review-bugbot` / `review-security` — optional ship-gate complements when available

## What not to skill-ify

- One-off product features (that’s lean loop: explore? → Plan mode or planner → builder → STOP; R/S/V on request or ship — see `docs/workflow.md`)
- Framework tutorials (link docs in overlay instead)
- Duplicate of an agent role (don’t make a “reviewer skill” that reimplements `reviewer`)

## How to add a custom skill

1. `.cursor/skills/<name>/SKILL.md` with a **trigger-rich** `description`
2. Steps + output shape; point at overlay commands for test/lint
3. Mention it in `AGENTS.md` or this file if it’s part of the lean loop / ship gate
4. Re-run `adopt-base` / copy into apps that need it

Rule of thumb: **agent** = who (role + permissions); **skill** = how/when for a repeatable procedure. Default path ends after build (STOP; suggest R/S/V). Plan deny → Task `planner`. No auto R/S/V after build.
