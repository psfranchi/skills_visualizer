# Supported formats

What the scanner reads for each client. Verified against [Cursor docs](https://cursor.com/docs) and the [Agent Skills specification](https://agentskills.io/specification) on 2026-10-15. Scanning never writes files and never executes anything (no scripts, no MCP servers).

## Cursor (MVP adapter)

### Verified

- **`AGENTS.md`:** at the repo root and in any subdirectory. Nested files combine with their parents; the more specific file wins.
- **Rules:** `.cursor/rules/**/*.mdc` (subfolders allowed; `.md` files are ignored). Frontmatter: `description`, `globs` (comma-separated string), `alwaysApply`. Their combination gives four activation modes:

  | Mode | Frontmatter |
  | --- | --- |
  | Always Apply | `alwaysApply: true` |
  | Apply to Specific Files | `globs` set, `alwaysApply: false` |
  | Apply Intelligently | `description` set, no `globs`, `alwaysApply: false` |
  | Apply Manually | none of the above (only via `@rule-name`) |

  `@file` in a rule body tells the agent to read that file; it is not inlined.
- **Skills:** roots `.cursor/skills/`, `.agents/skills/`, `.claude/skills/`, `.codex/skills/`, walked recursively. A nested `.cursor/skills/` in a subdirectory is scoped to that directory.
  - `name` must match the folder name: lowercase letters, digits, single hyphens, at most 64 characters.
  - `description` is required, at most 1024 characters.
  - Cursor extras: `paths` (legacy fallback `globs`), `disable-model-invocation`, `icon`, `color`, `metadata`.
  - Agent Skills extras: `license`, `compatibility`, `allowed-tools` (experimental).
  - **Editable (M3):** discovered `SKILL.md` files only (raw text → preview → hash-checked apply); MCP configs, rules, agents, and `AGENTS.md` are not editable through the app.
- **Subagents:** `.cursor/agents/*.md`, `.claude/agents/`, `.codex/agents/`; `.cursor` wins on a name conflict. Fields: `name` (defaults to the filename), `description`, `model` (defaults to `inherit`), `readonly`, `is_background`.
- **MCP:** `.cursor/mcp.json` = `{ "mcpServers": { "<name>": { … } } }`.
  - stdio servers: `type`, `command`, `args`, `env`, `envFile`.
  - Remote servers: `url`, `headers`, `auth` (`CLIENT_ID`, `CLIENT_SECRET`, `scopes`).
  - `${env:NAME}` interpolation.
  - Secret values never reach graph JSON, API responses, logs, or the UI: `env` / `headers` / `auth` show keys only unless the value is a pure `${env:…}` reference; `url` loses userinfo and query string; `args` after secret-looking flags are masked.

### Not verified

The scanner reports these as diagnostics or attributes and builds no semantics on them:

- Nested `.cursor/rules/` or `.cursor/agents/` in subdirectories.
- Case sensitivity of `AGENTS.md`.
- Base directory for rule `@path` resolution (default: repo root, then relative to the file; ambiguity gives a diagnostic).
- Whether `mcp.json` allows comments (parsed with strict `JSON.parse`; failure gives an error diagnostic).
- Nested directory-scoped rule activation beyond matching discovered paths (no Cursor runtime simulation).

### How the scanner treats these (M1 + post-MVP P1)

- **Edges:** Markdown links, images, and reference definitions, plus rule `@path` mentions, are `explicit` with source offsets. Inline-code text that matches an existing file is `inferred` (confidence 0.5, with an explanation); unmatched inline code is ignored. Explicit targets that don't exist give `unresolved-reference`.
- **Glob / paths match edges (P1):** rule `globs` and skill `paths` (legacy `globs`) produce derived `applies-to` edges (`linkKind: glob-apply`) to matching **discovered** file paths only (no filesystem walk beyond the scan list). Caps: 50 matches per pattern, 32 patterns per node, 256 chars per pattern, 500 glob edges per scan. Warnings: `glob-no-match`, `glob-match-capped`, `glob-pattern-too-long`, `glob-patterns-capped`, `glob-edges-budget`. This is path matching, not a claim about Cursor’s exact attach runtime.
- **Rule `@path` base:** repo root first, then relative to the rule; both existing gives `ambiguous-reference`.
- **Rule frontmatter** that isn't strict YAML (e.g. `globs: *.ts`) is read as plain `key: value` lines with an info diagnostic; other files report `malformed-frontmatter`.
- **Near misses are diagnostics, not nodes:** `SKILL.md` outside a skill root, `.md` files in `.cursor/rules`, `AGENTS.md` with different casing, nested `.cursor/rules` / agent dirs / `mcp.json` (unverified).
- **Files:** symlinks are neither listed nor followed; files over 1 MB are skipped with `file-too-large`; binary or invalid UTF-8 config files give `undecodable-file`.

### Not read (MVP)

User-level config (`~/.cursor`), hooks, commands, `.gitignore` (a fixed ignore list is used instead: `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `.venv`, `vendor`).
