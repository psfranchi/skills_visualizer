# Agentic Base — Orchestration Contract

Tech-agnostic agent workflow. Stack details live in the active overlay (see Stack below).

## Roles

| Agent | Role | Edits? |
|-------|------|--------|
| `explorer` | Search, grep, map codebase; return paths + short findings | No |
| `planner` | Goals, constraints, file list, risks, test plan; architecture fit at design-time (mid-Agent) | No |
| `builder` | Implement approved plan only; architecture discipline at implement-time | Yes |
| `reviewer` | Adversarial correctness / tests / regressions / structure | No |
| `security` | Injection, authz, secrets, OWASP mapping, unsafe defaults | No |
| `verifier` | Prove done: run checks, secrets on diff, match acceptance criteria | No |

**Main agent = orchestrator.** Prefer delegating to these subagents instead of replaying their job in the same context. Orchestrator **never edits app code/tests/config** (always spawn `builder`) and **never** commit/push/amend. May edit steering/docs when asked. See `.cursor/rules/15-orchestrator.mdc`.

## Subagent models

`adopt-base` installs every role as `inherit` (Auto); configure per project by editing `model:` frontmatter in `.cursor/agents/<role>.md` (source of truth) and mirroring it here. Re-sync preserves both.

| Role | Model | Backend |
|------|-------|---------|
| explorer | `inherit` | cursor |
| planner | `inherit` | cursor |
| builder | `inherit` | cursor |
| reviewer | `inherit` | cursor |
| security | `inherit` | cursor |
| verifier | `inherit` | cursor |

`inherit` = follow the chat's model (Auto when the chat uses Auto). Backend `codex-cli` (security only) = run `codex review` and validate its findings; see `.cursor/agents/security.md`.

**Explore naming:** role `explorer` · Task type `"explore"` · skill `explore-codebase` — same job. Use skill / Task `explore` for broad search so **builder** context stays small.

## Lean workflow

1. **Route-on-shape** before first broad read for search tasks.
2. **Need search / research?** → spawn **explorer** / Task `explore` first (skill `explore-codebase`).
3. **Non-trivial work, no approved plan yet** (incl. after explore) → prefer **SwitchMode → plan** (user must consent). If Plan mode is declined/denied → spawn Task **planner** for the same ask (do not stall). Spawn Task **planner** only when (a) Plan mode already denied this ask, (b) user said stay in Agent / skip Plan mode, or (c) mid-Agent with an active build pipeline where flipping mode would interrupt — **not** merely “after explore.” **Never both** for the same ask. Skip formal plan for trivial one-file fixes. Architecture fit (boundaries, modularity, coupling) lives in the plan whether Plan mode or planner — no separate architecture role.
4. **Build** → **builder** only after user OK (or explicit “build it”) on the plan (or trivial scope). Smallest diff. Architecture discipline at implement-time. Do not use builder as a search engine.
5. **STOP after build.** Report. **SUGGEST** `reviewer` / `security` / `verifier`. Do **not** auto-run them unless the user asks or says ship / merge-ready.

## Routing cheat sheet

| Ask shape | Route |
|-----------|--------|
| Typo / one-file obvious fix | **builder** |
| “Where is X?” / search / map | **explore** (Task explore / skill `explore-codebase`) |
| New big / ambiguous / multi-phase feature | **SwitchMode → plan** (incl. after explore); if denied / stay in Agent / active build pipeline interrupt → Task **planner** |
| Structure / patterns / boundaries during plan | Plan mode **or** **planner** (same architecture-fit notes; no architect) |
| Implement after plan | User OK / “build it” → **builder** |
| “Ship” / merge-ready | **reviewer** + **security** → **verifier** + skill `ship-checklist` (optional Bugbot + Cursor `/review-security`) |

## Ship gate (separate)

Ship / merge-ready is **not** the same as every R/S/V ask. When the user asks to ship or claims merge-ready:

1. `reviewer` + `security` (parallel OK)
2. Then `verifier`
3. Skill `ship-checklist` (and `pr-review` when useful)
4. **Optional:** `/review-bugbot` and Cursor `/review-security` when available (complements; see `.cursor/BUGBOT.md`)

Fix pass: feed Critical/High findings verbatim to `builder` — no autonomous loops.

## Git commits

When the user asks for a commit: use the human’s already-configured git identity only. Do not add `Co-authored-by` (or similar) for Cursor/AI. Do not change `user.name` / `user.email`. See `.cursor/rules/00-core.mdc`. Orchestrator does not perform git writes.

## Caveman (per role)

Status compression is defined in `.cursor/rules/20-communication.mdc` (no external skill install).

| Role | Intensity |
|------|-----------|
| builder | full (status only; never compress code/errors) |
| explorer, planner, reviewer, verifier | lite |
| security | off (normal prose) |

Drop compression for irreversible confirms and security warnings. Do not caveman-compress planner or security docs.

## Repeatable skills

Short playbooks under `.cursor/skills/` (e.g. `explore-codebase`, `ship-checklist`, `debug-incident`, `add-test`, `migrate-schema`) — stack commands come from the overlay, not from inventing runners. See `docs/recommended-skills.md`.

## Stack

No stack is pre-wired in this template. After install into an app, run skill `fill-stack-overlay` so these pointers become real:

- Overlay name: `_none_` (set to detected id, e.g. whatever `fill-stack-overlay` created)
- Stack brief: `overlays/<stack>/AGENTS.stack.md`
- Stack rules: `overlays/<stack>/rules/stack.mdc` → `.cursor/rules/90-stack.mdc`
- Commands skill (source of truth): `overlays/<stack>/skills/stack-commands/`
- Commands skill (runtime for agents): `.cursor/skills/stack-commands/` — always copied from the overlay

Until then: discover commands and layout from the repo — do not invent stack facts.

To install into an app: keep this repo in the **parent folder** next to the app, then prompt “Use this as the agentic template for ../my-app” (`adopt-base`).

## Integrations

Optional MCP / external tools: see [`docs/mcp.md`](docs/mcp.md). Do not ship a project `.cursor/mcp.json` with servers baked in. MCP is for reach-outside-repo work; keep the lean loop lean — don’t enable unused servers.
