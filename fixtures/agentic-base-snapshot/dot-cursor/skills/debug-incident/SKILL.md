---
name: debug-incident
description: >-
  Reproduce, diagnose, and minimally fix bugs or regressions. Use when the user
  reports an incident, production bug, flaky failure, “doesn’t work”, asks to
  reproduce, bisect, find a regression, or chase a failing test / runtime error.
---

# Debug incident

**When:** incident, bug, reproduce, bisect, regression, “broke after…”, failing check.

Stack-agnostic. Run test/lint/build commands from the app overlay (`stack-commands` / `.cursor/skills/stack-commands/`) — **do not invent** package-manager or framework commands.

## Lean loop

Orchestrator owns routing. This skill does **not** replace explore → plan → build:

1. Need search / “where is X?” → skill `explore-codebase` / Task explore first.
2. Non-trivial / ambiguous root cause → prefer Plan mode (or Task `planner` per `15-orchestrator`); get user OK before a large fix.
3. **Fix only via `builder`** — orchestrator spawns Task `builder`; do not edit app code in the main agent.
4. After fix: **STOP**. Suggest `reviewer` / `security` / `verifier`. Do not auto-run them unless the user asks or says ship.

## Steps

```
Debug:
- [ ] 1. Reproduce — exact steps, env, command, expected vs actual
- [ ] 2. Evidence — logs, stack traces, failing test output, bisect hint (no secrets)
- [ ] 3. Hypothesize — write 1–3 ranked causes; pick the cheapest to falsify
- [ ] 4. Smallest fix — spawn builder with scoped plan (no drive-by refactors)
- [ ] 5. Regression test — add/adjust test that fails without the fix
- [ ] 6. STOP — report; suggest R/S/V
```

### Hard rules

- No drive-by refactors or unrelated cleanup.
- Do not invent stack commands or ORM/framework APIs — read overlay / repo.
- Secrets stay out of logs, repro notes, and commits (redact tokens, keys, PII).
- Prefer characterization / failing-first tests (`add-test` when the ask is mostly coverage).

## Output shape

```markdown
## Repro steps
1. …

## Root cause
[1–3 sentences; which hypothesis won]

## Fix summary
[what changed; paths]

## Test added
[path + what it locks; or `no test because: …`]
```

Then: **STOP** — suggest `reviewer` / `security` / `verifier`.
