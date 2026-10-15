---
name: adopt-base
description: >-
  Install this agentic template into an application repo by copying agents,
  rules, skills, and docs, then running fill-stack-overlay. Use when the user
  says adopt-base, install agentic base, use this as the agentic template,
  apply agentic template to …, wire Cursor agents into my app, or points at
  agentic_base as the template for another project.
---

# Adopt agentic_base

## Goal

Install this template into a target app **for the user**. Prefer doing the file copies yourself (tools) — do **not** make the user run a long `cp` script unless they ask for commands only.

Then generate the stack overlay with `fill-stack-overlay` from the target app.

## Layout assumption

This repo lives in the **parent folder** next to application repos (e.g. `…/projects/agentic_base` and `…/projects/my-app`). Targets are usually `../my-app`.

## Trigger examples (user prompts)

- “Use this as the agentic template for `../my-app`”
- “Install agentic_base into …”
- “/adopt-base” / “adopt-base”

## Steps

```
Adopt progress:
- [ ] 1. Resolve source (this template) + target app path
- [ ] 2. Copy/merge core files into the target (you do it)
- [ ] 2b. Keep all agents on `model: inherit`
- [ ] 3. fill-stack-overlay on the target
- [ ] 4. Confirm AGENTS.md Stack section
- [ ] 5. Tell user to open/continue in the app workspace
```

### 1. Paths

- **Source**: this `agentic_base` root (where these skills live).
- **Target**: path the user gave (typically a sibling under the same parent folder).

If target is unclear, ask once. If target `.cursor/` exists, ask before overwrite — merge by default (keep their extras; replace/update our named agent/rule/skill files).

### 2. Install files (agent performs)

Copy from source → target:

| From | To |
|------|----|
| `AGENTS.md` | target root (merge Stack if they already have AGENTS.md) |
| `docs/workflow.md`, `docs/overlay-guide.md`, `docs/recommended-skills.md`, `docs/mcp.md`, `docs/cloud-and-automations.md`, `docs/adopt-dry-run.md` | `target/docs/` |

| `CHANGELOG.md`, `VERSION` | `target/docs/agentic-base/CHANGELOG.md`, `target/docs/agentic-base/VERSION` (create `docs/agentic-base/`; leave app root CHANGELOG untouched) |
| `.cursor/agents/*.md` | `target/.cursor/agents/` (full crew: explorer, planner, builder, reviewer, security, verifier) |
| `.cursor/rules/00-core.mdc`, `10-sdlc.mdc`, `15-orchestrator.mdc`, `20-communication.mdc`, `90-stack-placeholder.mdc` | `target/.cursor/rules/` |
| `.cursor/skills/**` | `target/.cursor/skills/` |
| `.cursor/hooks.json` | `target/.cursor/hooks.json` |
| `.cursor/hooks/**` | `target/.cursor/hooks/` (scripts executable; `chmod +x` `*.py`) |
| `.cursor/BUGBOT.md` | `target/.cursor/BUGBOT.md` |
| `overlays/_template/` | `target/overlays/_template/` |

Create directories as needed. Do not invent a pre-filled framework overlay.

### 2b. Models

Do **not** ask about subagent models. Every role installs as `model: inherit` (Auto — subagents follow the chat's model). Each app configures per-role models later, if it wants, by editing `model:` in its own `.cursor/agents/<role>.md` and the **Subagent models** table in its `AGENTS.md`.

- Leave `model: inherit` in every `target/.cursor/agents/<role>.md` as copied — no per-install model edits.
- Keep every model `inherit` in the target `AGENTS.md` **Subagent models** table.

### 3. Overlay

Follow skill **`fill-stack-overlay`** on the **target** app (detect stack, write `overlays/<stack>/`, wire `90-stack.mdc`).

### 4. Done

Summarize what was installed and the stack id. Tell the user to keep chatting in the **app** project for day-to-day work.

## Upgrade / re-sync

When this template changes and the target already has an older install:

1. Compare template root `VERSION` / `CHANGELOG.md` to `target/docs/agentic-base/VERSION` and `CHANGELOG.md` if present; summarize what’s new from `[Unreleased]` / newer versions.
2. Before re-copying agents, record each target agent's current `model:` value and the target **Subagent models** table (the app may have configured its own models); restore both after the copy. New roles get `inherit`. Re-ask the security backend (step 1b) only if the user asks.
3. Re-copy rules, agents, skills, **`hooks.json`**, **`hooks/**`**, **`BUGBOT.md`**, and docs (including `docs/mcp.md`, `docs/cloud-and-automations.md`, `docs/adopt-dry-run.md`) from source → target (same table as install), including **`15-orchestrator.mdc`**. Copy `CHANGELOG.md` + `VERSION` → `target/docs/agentic-base/`. Ensure hook `*.py` stay executable. Note: `examples/` (e.g. smoke-app) is **template-only** — not copied into apps; use it as the dry-run source per `docs/adopt-dry-run.md`.
4. If the target still has a stale **`architect.md`** (architecture role was removed — duties fold into `planner` / `builder`), **delete** `target/.cursor/agents/architect.md`.
5. Re-run or refresh `fill-stack-overlay` only if stack wiring is missing or outdated. If the app already has an overlay, re-copy `stack-commands` into `.cursor/skills/` if missing.
6. Summarize what was updated vs left alone (including preserved model values).

Do not special-case architect beyond deleting a leftover agent file; the normal copy of `.cursor/agents/*.md` is enough for the current crew.

