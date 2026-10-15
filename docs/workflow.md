# Workflow: lean loop (explore → plan → build → STOP)

Default path ends after build. Review, security, and verify run **on request** or when the user says ship / merge-ready.

## Lean loop

```
route-on-shape
  → explorer? (Task explore / skill explore-codebase)
  → Plan mode OR planner? (never both for same ask; deny → planner)
  → builder
  → STOP — report — SUGGEST reviewer / security / verifier
```

Orchestrator never edits app code (always spawn builder) and never commit/push/amend. See `.cursor/rules/15-orchestrator.mdc`.

## When to explore

Spawn **explorer** / Task `explore` (skill `explore-codebase`) when the work needs:

- Codebase search, grep, “where is X?”
- Mapping a subsystem across many files
- Research before planning (patterns, ownership, existing APIs)

**Route-on-shape before the first broad read** — do not dump large greps into orchestrator or builder context.

**Naming:** role `explorer` ≠ Task `"explore"` ≠ skill `explore-codebase` (same job).

Skip explore when the user already named the file and the change is local.

## When to plan

**Prefer Cursor Plan mode** (`SwitchMode` → plan) for new nontrivial, ambiguous, or multi-phase work — **including after explore** — when there is still no approved plan. User must consent to the mode switch.

**Plan-mode deny fallback:** If SwitchMode → plan is declined/denied → spawn Task `planner` for the same ask. Do not stall.

**Spawn Task `planner`** only when (a) Plan mode was already denied this ask, (b) user said stay in Agent / skip Plan mode, or (c) already mid-Agent with an **active build pipeline** where flipping mode would interrupt. “After explore, before build” alone still prefers Plan mode.

**Never both** Plan mode and planner for the same user ask (deny fallback replaces Plan mode — it is not “both”). Choosing Plan mode vs planner is the **orchestrator’s** job.

Use a formal plan when any of these apply **and there is no approved plan yet**:

- Multiple files or layers change
- API / schema / auth behavior changes
- Ambiguous requirements or more than one valid approach
- Estimated work > ~15 minutes of agent work

Skip a formal plan for trivial one-file fixes with an obvious approach — still keep the change small and tested.

## Plan output (required shape)

1. Goal (one sentence)
2. Constraints / non-goals
3. Files likely touched
4. Steps (ordered; multi-phase when needed)
5. Risks / unknowns
6. Test plan (commands from overlay + cases — do not invent package-manager commands)
7. Acceptance criteria (checkable)

Do not implement during planning. **Plan mode and planner** both include architecture fit at design-time: prefer existing patterns; call out boundaries, modularity, and coupling; structure multi-phase work. No separate architecture role.

**User OK before build:** do not spawn `builder` until the user approves the plan (or says “build it”).

## Build

- Only after an approved plan (user OK / “build it”) or a clearly trivial one-file task.
- Follow the approved plan only.
- Prefer existing patterns; clear boundaries; atomic, clear, readable code (architecture discipline at implement-time).
- Behavior changes need tests (or `no test because: …`).
- Run project test/lint commands from the stack overlay after meaningful changes.
- If the plan is wrong (including structure/boundaries), stop and re-plan — do not silently expand scope or invent a parallel architecture role.
- Commits (only when the user asks): sole author = configured human git identity; no AI/`Cursor` co-author trailers; never change git config.
- Builder is not a search engine — spawn explore for broad research.
- After build: **STOP**. Suggest `reviewer` / `security` / `verifier` — do not auto-run them.

## Review + security + verify (on demand)

Do **not** run by default after every build.

Run when the user asks for review / security / verify (or a PR review), **or** when they say ship / merge-ready (see ship gate below). A single R/S/V ask is **not** the full ship gate.

- `reviewer`: correctness, missing tests, unreadable/over-coupled structure, contract breaks, regressions. Not style nits.
- `security`: confirmed vulns with OWASP Top 10 mapping, mandatory secrets pass, severity + concrete fix.
- `verifier`: acceptance criteria with tests evidence; secrets check on diff (secrets → FAIL).

### Fix pass

Feed Critical/High findings to `builder` **verbatim**. No autonomous review→fix→review loops — user (or orchestrator on request) decides the next pass.

## Ship gate

Ship / merge-ready is a **separate** full gate — not the same as every R/S/V ask. Only when the user asks to ship or claims merge-ready:

1. `reviewer` + `security` (parallel OK)
2. `verifier` verdict PASS (or BLOCKED explained)
3. Skill `ship-checklist` before open/merge PR
4. **Optional:** `/review-bugbot` and Cursor `/review-security` when available (complements to the in-repo crew; see `.cursor/BUGBOT.md`)
