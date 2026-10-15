---
name: add-test
description: >-
  Add the smallest useful test for a behavior or bug. Use when the user asks to
  add a test, cover a bug, write a characterization / regression test, or notes
  a missing test for existing or just-fixed behavior.
---

# Add test

**When:** add test, cover bug, characterization test, missing test, lock behavior.

Stack-agnostic. Discover test runner and paths from the overlay (`stack-commands` / `.cursor/skills/stack-commands/`) or existing tests — **do not invent** commands.

## Lean loop

- Locate similar tests with `explore-codebase` if the suite layout is unknown.
- Non-trivial fixture design → Plan mode / planner per `15-orchestrator` if needed.
- Implementation edits → orchestrator spawns **`builder`** only (approved / trivial scope).
- After build: **STOP**; suggest R/S/V on request or ship.

## Steps

```
Add test:
- [ ] 1. Find existing test style — same dir patterns, helpers, naming, runner
- [ ] 2. Smallest failing test — asserts the desired behavior (or documents current bug)
- [ ] 3. Make pass — fix production code only if behavior is wrong; else leave code, keep the test
- [ ] 4. Run overlay test command — paste summary; do not invent a runner
```

If behavior is already correct: add the locking test only (no drive-by refactors).

## Output shape

```markdown
## Test path
`path/to/test`

## Command run
[from overlay / stack-commands]

## What it locks
[behavior / bug / edge case in one sentence]
```

`no test because: …` only when a test is genuinely impossible — prefer a smallest characterization test instead.
