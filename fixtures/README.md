# Fixtures

Test inputs for the scanner. Do not edit by hand-formatting tools: Biome ignores `fixtures/`, and `.gitattributes` marks it `-text` so line endings and BOMs stay byte-exact.

All secret-looking values are sentinels (`SENTINEL-NOT-A-SECRET-*`); none may appear in scanner output.

## Naming convention (isolation)

Cursor applies nested `AGENTS.md` and `.cursor/` folders to their directories, so fixtures are stored under renamed names and never load as real config:

| Stored on disk | Real name |
| --- | --- |
| `dot-cursor/`, `dot-agents/`, `dot-claude/`, `dot-codex/` | `.cursor/`, `.agents/`, `.claude/`, `.codex/` |
| `AGENTS.fixture.md` | `AGENTS.md` |
| `CLAUDE.fixture.md` | `CLAUDE.md` |

The mapping applies to every path segment at any depth and lives in one table, `FIXTURE_NAME_MAP` in `src/test-support/fixtures.ts`. Tests never read fixtures directly: `loadFixture(name)` returns a `MemoryFileSource` with real names, and `materializeFixture(name)` copies a fixture to a temp dir with real names (the caller deletes it). `SKILL.md` files keep their name — outside a skill root they are inert. File contents use real names (links say `.cursor/...`).

Each fixture's `expected.graph.json` is its golden graph (produced from `loadFixture`, so paths use real names); it is excluded from the fixture's file set. Update it with `pnpm test -u` after an intended change.

The tables below use real names.

## `cursor-basic/`

Root and nested (`packages/api/`) `AGENTS.md`; three skills with `references/` and `scripts/`, all linking the shared `docs/conventions.md`; rules in a subfolder covering all four activation modes; two subagents; `.cursor/mcp.json` with stdio and remote servers.

## `cursor-edge/`

| Case | Where |
| --- | --- |
| Missing link target | `AGENTS.md` → `docs/setup.md`; `.cursor/rules/valid.mdc` → `@docs/missing-guide.md` |
| Reference cycle | `.cursor/skills/cycle-a` ↔ `cycle-b` |
| Unknown frontmatter fields with comments | `.cursor/skills/unknown-fields` |
| Malformed YAML | `.cursor/skills/malformed-yaml` |
| Skill name ≠ folder | `.cursor/skills/name-mismatch` |
| `.md` inside rules | `.cursor/rules/notes.md` |
| `SKILL.md` outside any skill root | `docs/SKILL.md` |
| `node_modules/**/SKILL.md` | `node_modules/some-pkg/.cursor/skills/vendored` |
| Nested skill root | `apps/x/.cursor/skills/scoped-skill` |
| CRLF | `AGENTS.md`, `.cursor/skills/crlf-skill`, `.cursor/rules/bom-rule.mdc` |
| UTF-8 BOM | `.cursor/skills/bom-skill`, `.cursor/rules/bom-rule.mdc` |
| Symlink escaping the root | Not committed; tests create it in setup and remove it after |

## `agentic-base-snapshot/`

Frozen copy of `~/projects/agentic_base` `.cursor/` and `AGENTS.md` (commit `0a466ad`, VERSION 0.4.0, copied 2026-10-15; `__pycache__` excluded). Used for golden tests; never refresh it silently — regenerate the golden file in the same change.

## `claude-basic/`

Claude Code surfaces: root `CLAUDE.md`; `.claude/skills/code-review` and `.claude/agents/explorer`; a Cursor skill with the same name (`.cursor/skills/code-review`) so multi-engine scan emits `skill-shadowed`. No Cursor rule-activation on Claude files.

## `codex-basic/`

Codex surfaces only: `.codex/skills/ship` and `.codex/agents/reviewer` (no separate Codex instruction file in-repo; `AGENTS.md` stays Cursor-owned when present).
