---
name: ship-checklist
description: >-
  Pre-merge checklist when the user asks to ship / merge-ready: diff scope,
  tests, secrets, docs, reviewer/security/verifier. Use before opening or
  merging a PR, when claiming ship-ready, or when the user says ship-checklist.
---

# Ship checklist

**When:** user asks to ship, claims merge-ready, or says ship-checklist. Not after every build.

Before this checklist: run `reviewer` + `security` (parallel OK), then `verifier` (see `15-orchestrator` / `docs/workflow.md`).

**Optional complements** (after custom R/S/V, when available): `/review-bugbot` and `/review-security` (skills `review-bugbot` / `review-security`). Do not replace the in-repo crew.

Copy and complete:

```
Ship:
- [ ] Diff matches approved plan / acceptance criteria (no drive-by)
- [ ] Tests run (stack command) — paste summary
- [ ] Lint/format run if overlay defines it
- [ ] No secrets in diff (.env, keys, tokens, credentials in code/config/logs/client bundles)
- [ ] Commits authored only by the human git identity (no AI/Cursor Co-authored-by trailers)
- [ ] Docs updated only if behavior/API changed (or N/A)
- [ ] reviewer findings addressed or waived with reason
- [ ] security findings addressed or waived with reason (incl. OWASP-mapped + secrets pass)
- [ ] verifier verdict PASS (or BLOCKED explained); secrets check clear
- [ ] Optional: /review-bugbot run or n/a
- [ ] Optional: /review-security (Cursor) run or n/a
```

## Output

Return the checklist with each item `done` / `fail` / `n/a` + one-line evidence. If any must-fix item fails, say **not ship-ready**.
