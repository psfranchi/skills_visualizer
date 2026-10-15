---
name: pr-review
description: >-
  Structured PR or diff review output (critical / suggestion / nit). Use when
  reviewing pull requests, or when the user asks for a PR review format.
  Complements the reviewer agent.
---

# PR review format

## Steps

1. Scope the change (PR URL, branch diff, or files).
2. Prefer correctness, tests, contracts, regressions over style.
3. Emit:

```markdown
## Summary
[what the change does — 1–3 sentences]

## Findings
### Critical
- `file:line` — problem — fix direction

### Suggestion
- ...

### Nit
- ... (optional)
```

4. End with **merge recommendation**: approve / request changes / blocked (missing info).

Delegate deep security work to the `security` agent when auth, input, or secrets are in play.
