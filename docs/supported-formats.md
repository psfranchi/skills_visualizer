# Supported formats

What the scanner reads for each AI engine. Verified against [Cursor docs](https://cursor.com/docs), [Claude Code docs](https://code.claude.com/docs), [Codex / ChatGPT agent docs](https://learn.chatgpt.com/docs), and the [Agent Skills specification](https://agentskills.io/specification) (checked 2026-10-15). Scanning never writes files and never executes anything (no scripts, no MCP servers).

Every graph node carries an **`engine`** attribute: `cursor` | `claude` | `codex` | `shared`. Adapters run together (`SUPPORTED_ADAPTERS = cursor, claude, codex`) and merge into one graph with path-based IDs.

## Cursor

**Engine tag:** `cursor` (`.agents` skills are `shared`).

### Verified

- **`AGENTS.md`:** at the repo root and in any subdirectory. Nested files combine with their parents; the more specific file wins. Tagged `engine: cursor` (also consumed by Codex as project guidance — same file, one node).
- **Rules:** `.cursor/rules/**/*.mdc` only (subfolders allowed; `.md` ignored). Frontmatter: `description`, `globs`, `alwaysApply` → four activation modes. `@file` mentions are explicit edges. **Not** applied to Claude/Codex files.
- **Skills:** `.cursor/skills/` and `.agents/skills/` (shared), walked recursively. Nested `.cursor/skills/` is scoped to that directory. Agent Skills + Cursor extras (`paths` / legacy `globs`, etc.). **Editable:** discovered `SKILL.md` only.
- **Subagents:** `.cursor/agents/*.md`.
- **MCP:** `.cursor/mcp.json` only (stdio / remote; secrets redacted).

### Not verified / diagnostics only

- Nested `.cursor/rules/` or `.cursor/agents/`; `AGENTS.md` case variants; rule `@path` base ambiguity; `mcp.json` comments; Cursor runtime attach beyond discovered-path glob matching.

### How the scanner treats Cursor (M1 + P1)

- **Edges:** Markdown links / `@mentions` explicit; backtick paths inferred; rule `globs` / skill `paths` → derived `applies-to` (`linkKind: glob-apply`) against the scan path list (caps + warnings as in P1).
- Near misses are diagnostics, not nodes. Symlinks skipped; files over 1 MB skipped; binary UTF-8 failures diagnosed.

## Claude

**Engine tag:** `claude`. Verified against [Claude Code memory / CLAUDE.md docs](https://code.claude.com/docs/en/claude-md) and [`.claude` directory docs](https://code.claude.com/docs/en/claude-directory).

### Verified

- **`CLAUDE.md`:** project root `CLAUDE.md` or `.claude/CLAUDE.md` (and nested project scopes). Parsed as `instruction` with reference edges and scope `applies-to` — **not** Cursor rule activation.
- **Skills:** `.claude/skills/**/SKILL.md` (Agent Skills shape; editable like other skills).
- **Subagents:** `.claude/agents/*.md`.

### Not given Cursor semantics

- **`.claude/rules/*`:** documented by Claude Code but surfaced as `unverified-claude-rules` diagnostics only — no `activation` / Cursor glob modes.
- User-level `~/.claude`, hooks, settings.json, auto-memory: not read.

## Codex

**Engine tag:** `codex`. Skills/agents under `.codex/` are discovered. Repo `AGENTS.md` is owned by the Cursor adapter (Codex also reads it per [Codex AGENTS.md docs](https://learn.chatgpt.com/docs/agent-configuration/agents-md)); no separate Codex-only instruction filename is given extra semantics in-repo. User-level `~/.codex` is not read.

### Verified (this pass)

- **Skills:** `.codex/skills/**/SKILL.md`.
- **Subagents:** `.codex/agents/*.md`.

### Shared / elsewhere

- **`.agents/skills`:** tagged `engine: shared` (Cursor adapter discovery; used by Codex skill layouts too).

## Cross-engine

- **Shadowing:** same agent or skill **name** at repo scope across roots → `agent-shadowed` / `skill-shadowed` warnings. Precedence: `.cursor` > `.claude` > `.codex` > `.agents`.
- **UI:** toolbar engine chips (All / Cursor / Claude / Codex); node badges and graph stroke tint by engine; legend lists engines.
- **Edit policy:** unchanged — any discovered editable `SKILL.md` via `adapter.editable()`, hash-checked apply.

## Not read (all engines)

User-level config (`~/.cursor`, `~/.claude`, `~/.codex`), hooks, commands, `.gitignore` (fixed ignore list: `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `.venv`, `vendor`).
