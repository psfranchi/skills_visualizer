---
name: migrate-schema
description: >-
  Plan and execute schema or data-shape changes safely. Use when the user asks
  for a migration, schema change, expand/contract rollout, backfill, or
  zero-downtime DB/API column/table evolution.
---

# Migrate schema

**When:** migration, schema change, expand/contract, backfill, zero-downtime cutover.

Stack-agnostic checklist. Fill concrete migrate/test commands from the app overlay (`stack-commands` / `.cursor/skills/stack-commands/`) when present. **Do not invent** ORM APIs, migration DSL, or package commands — read the overlay or ask.

## Lean loop

- Map current schema / migration layout with explore if needed.
- Non-trivial multi-phase change → Plan mode (or planner per `15-orchestrator`); user OK before build.
- Apply migrations / code via **`builder`** only.
- After build: **STOP**; suggest R/S/V (especially `security` if authz/data exposure changes).

## Checklist

```
Migrate:
- [ ] Expand phase — additive change first (nullable/new table/new column); old code still works
- [ ] Contract phase — remove old path only after dual-write/read window (or document why single-shot is OK)
- [ ] Rollback — how to reverse or forward-fix if migrate fails mid-way
- [ ] Data backfill — batch size, idempotency, who runs it, downtime window
- [ ] Zero-downtime notes — lock risk, long transactions, dual-write, feature flags
- [ ] Test plan — migration dry-run / up+down if overlay supports; app tests for new shape
- [ ] Commands — from overlay only (migrate, test, lint); leave blank + discover if missing
```

## Output shape

```markdown
## Phases
- Expand: …
- Contract: … (or N/A + why)

## Rollback
…

## Backfill
…

## Zero-downtime
…

## Test plan + commands
[overlay commands or “discover from repo — not invented”]
```

Hard: no secrets in migration notes or logs; no drive-by refactors outside the migration plan.
