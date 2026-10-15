# Changelog

All notable changes to this agentic template are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-10-15

### Fixed

- Subagent `description:` in `.cursor/agents/*.md` is now a single quoted line. Cursor's subagent loader read the YAML folded block (`>-`) literally, so every custom subagent showed `>-` as its description and could not be routed by intent. Skills are unaffected; keep agent descriptions single-line.

### Changed

- `adopt-base` no longer prompts for subagent models or needs the Cursor CLI (`agent models`): every role installs as `model: inherit` (Auto). Apps configure per-role models themselves in `.cursor/agents/<role>.md` + the `AGENTS.md` Subagent models table; re-sync still preserves them.

### Removed

- Codex CLI security backend: the `adopt-base` question, the `Backend` column in the `AGENTS.md` Subagent models table, and the Codex procedure in `.cursor/agents/security.md`. All roles run as normal Cursor subagents on Cursor models. It never worked in practice: `security` is `readonly: true`, which blocks shell commands, including `codex`.

## [0.4.0] - 2026-10-15

### Added

- `adopt-base` always prompts for subagent models: **Auto** (all `inherit`) or **choose per role** using real IDs from `agent models` (bracket parameters, e.g. `<id>[effort=high]`). Choices are written to each agent's `model:` frontmatter and mirrored in a new **Subagent models** table in `AGENTS.md`.
- Optional **Codex CLI** backend for `security`, asked at install only when `codex` is on `PATH` and off unless the user opts in: runs `codex review` (uncommitted / base / commit), validates each finding, and falls back to a normal review when Codex is missing or fails.

### Changed

- README install guide tightened; mentions the model prompt.
- `adopt-base` upgrade / re-sync preserves existing model choices and the Subagent models table.
- `verifier` now `readonly: false` so test / build runs can write caches and output (Cursor's readonly blocks state-changing shell); instructions still forbid editing repo files or running source-modifying commands. `security` stays readonly and notes the Codex CLI may need user approval.

### Fixed

- Secret-scan hooks no longer block URL credentials on `localhost` / `127.0.0.1` (local dev DB URLs, test fixtures).

## [0.3.0] - 2026-09-15

### Added

- P2 skills: `debug-incident`, `add-test`, `migrate-schema` (stack-agnostic playbooks; commands from overlay).
- P3 docs: `docs/cloud-and-automations.md`, `docs/adopt-dry-run.md`; tiny `examples/smoke-app` for adopt dry-run (template-only, not copied into apps).
- `adopt-base` copies the new docs; notes that `examples/` stays in the template.

### Changed

- `docs/recommended-skills.md`, README skills inventory, and `AGENTS.md` mention the new repeatable skills.
- Light `.cursor/BUGBOT.md` pointer to `debug-incident` / `add-test` when relevant.

## [0.2.0] - 2026-09-15

### Changed

- Lean orchestrator loop: explore → Plan mode or planner → builder → STOP; reviewer / security / verifier on request or ship (`15-orchestrator`, `AGENTS.md`, `docs/workflow.md`).
- Architecture role removed; architecture fit lives in Plan mode / planner at design-time and builder at implement-time. Stale `architect.md` deleted on adopt upgrade.
- `fill-stack-overlay` and overlay docs: **always** copy `stack-commands` into `.cursor/skills/stack-commands/` (Cursor indexes that path reliably).

### Added

- P0 failClosed hooks: dangerous-git gate + secret scan on Write/StrReplace and on prompt (`.cursor/hooks.json`, `.cursor/hooks/`).
- Optional Bugbot notes (`.cursor/BUGBOT.md`) for ship complements.
- `docs/mcp.md` — practical MCP / integrations guide; no baked project `mcp.json` with servers.
- Template `VERSION` (`0.2.0`) and this `CHANGELOG.md`; on adopt, copied to `docs/agentic-base/` in the target app.

### Fixed

- Stack commands skill pointer documents both overlay source of truth and `.cursor/skills/` runtime path.
