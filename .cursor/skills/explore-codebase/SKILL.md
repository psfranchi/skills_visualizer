---
name: explore-codebase
description: >-
  Spawn a readonly explorer (Task explore) for search, grep, layout discovery,
  and research so the main/builder context stays clean. Use when locating
  symbols/files, mapping a subsystem, answering “where/how does X work?”, or
  gathering evidence before planning or building.
---

# Explore codebase (context-saving)

## Goal

Offload **search and research** to an isolated **explore** subagent. Return a short map of findings to the parent. Do **not** dump huge file contents into builder or orchestrator context.

## Naming

| Label | What it is |
|-------|------------|
| `explorer` | Role / agent file (`.cursor/agents/explorer.md`) |
| Task `"explore"` | Cursor Task `subagent_type` |
| skill `explore-codebase` | This skill — when/how to spawn |

Same job; three names. Prefer this skill + Task `explore` so the main agent does not broad-grep itself.

## Route-on-shape (before first broad read)

If the task shape is search / map / “where is X?”, spawn explore **before** the first large grep or multi-file read in the parent context.

## When to use (spawn explore)

Use `Task` with `subagent_type: explore` when any of these apply:

- Grep / ripgrep / “find all usages”
- “Where is X defined / configured?”
- Map a package, feature, or data flow across many files
- Compare patterns before planning
- Research outside a single known file (docs, configs, tests, sibling packages)

**Skip** explore for:

- One known path the user already named
- Trivial single-file edits with an obvious location
- After explore already returned enough for the next step

## How to invoke

Main agent / orchestrator:

1. Call **Task** → `subagent_type: "explore"`.
2. Set thoroughness: `quick` | `medium` | `very thorough` (default medium for feature work).
3. Prompt must include: question, repo path hints, what to return (paths + 1-line why each).
4. Prefer **parallel** explores for independent questions.
5. Consume the summary; then route per `15-orchestrator`: for new nontrivial work still without an approved plan, **prefer SwitchMode → plan** (unless Plan mode already denied / user said stay in Agent / active build pipeline would be interrupted — then Task `planner`). Spawn `builder` only after user OK (or “build it”) / trivial scope. Do not re-search the same ground in builder.

## What explore should return

```markdown
## Answer
[2–5 sentences]

## Key paths
- `path` — why it matters

## Notes / risks
- ...
```

No code edits. No commits.

## Relationship to other roles

| Need | Role / skill |
|------|----------------|
| Search / map / research | **explore** / **explorer** (this skill) |
| Design approach + structure / boundaries | Prefer Plan mode; Task `planner` only per `15-orchestrator` exceptions |
| Implement approved plan | `builder` (architecture discipline at implement-time) |
| Adversarial review | `reviewer` / `security` (on request or ship) |
| Prove done | `verifier` (on request or ship) |

Builder must not substitute for explore on broad searches.
