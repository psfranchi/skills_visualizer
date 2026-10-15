# Skills Visualizer

Local tool that turns a repo’s **agent configuration** into an interactive graph across **Cursor, Claude, and Codex**: skills, rules/instructions, subagents, `AGENTS.md` / `CLAUDE.md`, MCP — with provenance on every edge, engine tags + filters, and safe raw edits to `SKILL.md` (diff → hash-checked apply → rescan).

---

## This repo is an experiment

**Governance is handed to the AI crew end-to-end.** A human set the goal and constraints; agents plan, implement, review, verify, commit, and (for this GitHub remote only) push. The owner does not gate each milestone or approve every command.

That is intentional: this project is a live test of **fully autonomous agentic development** on a real product, not a demo scaffold.

| Who | Role here |
| --- | --- |
| Human | Product intent, hard safety rails (hooks, no force-push elsewhere), occasional blocking decisions |
| Default chat agent | **Orchestrator only** — routes work, does not write app code |
| `explorer` / `planner` / `builder` / `reviewer` / `security` / `verifier` | Search, plan, implement + commit, adversarial review, security pass, prove acceptance |

Playbooks and contracts live in [`AGENTS.md`](AGENTS.md) and [`.cursor/`](.cursor/). Local git commits are conventional and trailer-free; agents may push **only** to [`psfranchi/skills_visualizer`](https://github.com/psfranchi/skills_visualizer) (force-push and other remotes stay blocked).

If you fork this for a normal human-driven workflow, treat the “Project overrides” section in `AGENTS.md` as optional experiment policy — not as the default for every repo.

---

## What it does

1. **Scan** Cursor, Claude, and Codex surfaces into one versioned graph JSON with explicit / derived / inferred evidence and per-node `engine` tags.
2. **View** the full picture in the browser (D3 + Dagre): filter by engine or kind, inspect attributes, jump to source ranges, pin layout.
3. **Edit** discovered `SKILL.md` files when writes are enabled: preview unified diff + diagnostics + edge impact, then apply only if the content hash still matches.

Designed **local-first** (`127.0.0.1`); a later hosted/upload mode is not built yet, but I/O goes through a `FileSource` so that path stays open. Scanning never executes skills, scripts, or MCP servers. MCP secret values are redacted and must not appear in graph JSON, API responses, or the UI.

Formats: [`docs/supported-formats.md`](docs/supported-formats.md). MVP plan (M0–M3 done): [`docs/mvp-plan.md`](docs/mvp-plan.md). Post-MVP roadmap: [`docs/post-mvp-plan.md`](docs/post-mvp-plan.md).

---

## Requirements

- **Node** `24.22.0` (see `.nvmrc`; `nvm use`)
- **pnpm** `12.11.2` (Corepack: `corepack enable`)

```bash
pnpm install
```

---

## Run

```bash
# Dev (Vite + API on loopback)
pnpm dev [dir]          # default dir: current repo
pnpm dev . --port 5320

# Production-ish: build UI, then serve
pnpm build
pnpm start [dir]

# Graph JSON only (no UI)
pnpm scan <dir> [--out graph.json]
```

On start, the CLI prints a URL like:

`http://127.0.0.1:<port>/?token=…`

Open **that** URL (token is only printed in the terminal). It sets an HttpOnly cookie; `/api/*` also accepts `Authorization: Bearer <token>`. Requests without auth get `401`.

---

## Checks

```bash
pnpm check    # lint + typecheck + test
pnpm test
pnpm lint
pnpm typecheck
```

---

## Layout

| Path | Role |
| --- | --- |
| `src/core` | Pure graph model, paths, hashing, `FileSource` |
| `src/scanner` | Discovery + Cursor adapter |
| `src/layout` | Dagre layout |
| `src/source-editing` | EOL/BOM-aware replace, diff, validation |
| `src/server` | Hono API + Node local filesystem |
| `src/cli` | `dev` / `serve` / `scan` |
| `src/web` | React UI + D3 graph |
| `fixtures/` | Isolated fixtures (renamed so Cursor won’t load them as real config) |

Pure modules (`core`, `scanner`, `layout`, `source-editing`) must not import `node:*`, React, Hono, or the server/web packages.

---

## Status

MVP milestones **M0–M3** are complete (scaffold → scanner → read-only viewer → skill edit with local auth). Post-MVP **P1–P4** are complete per [`docs/post-mvp-plan.md`](docs/post-mvp-plan.md) (Cursor semantics → multi-engine → visual system → MD preview/editing). Stretch items remain under P5.

---

## License / ownership

Private experiment under the repo owner’s GitHub account. No guarantee of API stability or support outside this autonomous-run context.
