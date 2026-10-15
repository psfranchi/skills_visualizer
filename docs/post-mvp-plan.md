# Skills Visualizer — Post-MVP Plan

Status: approved 2026-10-15. MVP (M0–M3) is done: [`mvp-plan.md`](mvp-plan.md). Product brief: [`agent-architecture-explorer-plan.md`](agent-architecture-explorer-plan.md).

## Goal

A trustworthy **architecture diagram + inspector** for local agent configs across engines (Cursor, Claude, Codex): what exists, which engine owns it, when it applies, what references what, and what’s broken or duplicated — without an LLM inventing edges. After Cursor semantics, multi-engine scanning, polished 2D UI, and CodeMirror + Markdown preview, users can open any repo, see all agent surfaces in one graph, filter by engine, inspect provenance, and edit skills safely.

## Decisions (locked)

| Topic | Decision |
| --- | --- |
| Graph viz | SVG/D3 with polished CSS and light depth. **No WebGL/three.js** in this train. |
| AI linking | **No AI model for core linking.** Optional later: annotation suggestions only (`evidence: annotation`, off by default). |
| Editing | CodeMirror 6 + live MD preview for `SKILL.md` first; read-only rendered preview for other MD; rules/agents write later. |
| Multi-engine | **In-scope.** Engines are first-class; do not pretend Claude/Codex are Cursor. |
| Experiment cadence | Crew loop in [`AGENTS.md`](../AGENTS.md); push only to this GitHub remote (`psfranchi/skills_visualizer`); never force-push. |
| Phase order | P1 Cursor semantics → P2 Multi-engine → P3 Visual system → P4 MD surfaces. Engines before visual polish so the full-picture promise is real before a second UI pass. |

## Product take

People with serious agent setups don’t lack files — they lack a map: what exists, which engine owns it, when it activates, what references what, and what’s broken. A strong user outcome:

1. Open any repo → see **all** agent surfaces in one graph (skills, rules/instructions, subagents, MCP, AGENTS/CLAUDE-style docs).
2. Filter by **engine** (Cursor / Claude / Codex / shared) and still see **cross-engine overlap** (same skill name in two roots, shadowing).
3. Click anything → **why it’s here**, **when it activates**, **edges with provenance**, **safe MD preview**.
4. Fix a skill safely (diff → apply) without leaving the map.
5. Export/share a graph later (paths already folder-name-safe) for team review.

Deterministic scan + great explanation beats “an LLM summarized your agents.”

## Honest starting point

Today’s Cursor adapter already **discovers** `.claude` / `.codex` / `.agents` skills and agents and tags `attributes.root`. Rules/MCP/AGENTS semantics are still Cursor-shaped. Users can get a partial multi-root picture, but not a true multi-**engine** story (Claude `CLAUDE.md` / project settings, Codex-specific layout, engine filters, honest docs).

## Suggested complement (beyond UI/editing)

| Idea | Why | When |
| --- | --- | --- |
| Engine filter + legend | Full picture without noise; Cursor-only vs Claude-only vs shared | With multi-engine (P2) |
| Health / gaps panel | Orphans, unresolved refs, empty globs, name shadowing, skill-name mismatch | After semantics |
| Focus / neighborhood | Dim unrelated; path to root instruction | P1 |
| Compare engines | Same skill id in `.cursor` and `.claude` → duplicate/diverge diagnostic | Multi-engine |
| Watch + rescan (chokidar) | Edit in IDE, graph updates | Stretch (P5) |
| Export graph JSON / PNG | Team share, PR attachment | Stretch (P5) |
| Hosted upload | Already architected via `FileSource` | Stretch / after security backlog |
| User-level `~/.cursor` | Completeness for power users | Stretch (privacy UX) |

---

## P1 — Cursor semantics (deeper interpretation)

**Goal:** inspector answers “when does this apply?” and “why this edge?”

1. Surface rule **activation** as first-class UI (badge/chip); data already on rule nodes via `ruleActivation`.
2. Deterministic **derived** edges from rule `globs` and skill `paths`/`globs` to matching discovered file (and maybe directory) nodes — cap fan-out (e.g. max 50 matches per glob); diagnostic when a glob matches nothing. Do not invent Cursor runtime semantics beyond matching discovered paths. Match against the scan’s discovered path list only (no filesystem walk). Prefer a pure matcher or adapter-side matching so pure-core stays free of `node:*`.
3. Human-readable edge labels in inspector (and legend if needed): distinguish markdown link, `@mention`, inferred backtick, contains/derived folder, glob/paths apply.
4. **Focus mode:** when a node is selected, dim unrelated nodes/edges (neighborhood = selected + neighbors); toolbar or inspector control “Focus selection” (default on or obvious toggle); full graph when off. Optional: show path toward nearest instruction/`AGENTS.md` parent if cheap.
5. Tests for new edges + label helpers; update goldens if fixtures change; update [`supported-formats.md`](supported-formats.md) (globs/paths now produce match edges).

**Out of scope:** LLM links, relationship editing.

**Accept:**

- [x] Rule activation visible in inspector and graph chrome.
- [x] Glob/paths → discovered-path derived edges with fan-out cap and empty-match diagnostics.
- [x] Edge labels distinguish link / `@mention` / backtick / contains / glob-apply.
- [x] Focus selection dims non-neighborhood; toggle restores full graph.
- [x] Tests + goldens + `supported-formats.md` updated; `pnpm check` green.

**Status (2026-10-15): done.** Verifier: `pnpm check` (339 tests) + `pnpm build` green; activation badges in inspector/list/graph (`activation.ts`, `graph-render` marks); glob/paths `applies-to` edges with fan-out cap 50 + empty/capped diagnostics (`glob-edges.ts`, adapter tests); edge labels + legend for markdown / `@mention` / backtick / contains / glob-apply; Focus selection default-on dims non-neighborhood (`focusNeighborhood`, toolbar toggle); goldens + `supported-formats.md` updated; secrets clear on P1 diff; no `Co-authored-by` on P1 commits. Residual: optional path-to-nearest-`AGENTS.md` not implemented (plan marked optional).

---

## P2 — Multi-engine (Cursor, Claude, Codex)

**Goal:** users see a **full picture across AI engines**, tagged and filterable, without inventing cross-product semantics.

1. Shared graph schema; every node carries **`engine`** (and existing `root` / `scope`).
2. Split or extend adapters: `cursor` | `claude` | `codex` behind `SUPPORTED_ADAPTERS`; scan merges into one graph with stable path-based IDs.
3. **Cursor:** current behavior (rules `.mdc`, `AGENTS.md`, `.cursor/mcp.json`, skills/agents).
4. **Claude:** document and parse what we verify (e.g. `.claude/` skills/agents already found; add `CLAUDE.md` / project instruction files only after doc verification — attributes/diagnostics if unverified).
5. **Codex:** `.codex/` skills/agents; verify Codex-specific instruction files before building semantics.
6. **Shadowing:** keep/extend “`.cursor` wins on name conflict”; surface collisions as diagnostics.
7. **UI:** toolbar engine chips (Cursor / Claude / Codex / All); node tint or badge by engine; legend.
8. Fixtures: `fixtures/claude-basic`, `fixtures/codex-basic` (+ goldens); update agentic-base snapshot expectations if needed.
9. Docs: per-engine sections in `supported-formats.md`; README “full picture” blurb.

**Do not:** merge different products’ rule systems into one fake activation model; **do** show them side by side with clear engine labels.

**Edit policy:** skill apply remains “discovered editable `SKILL.md`” with adapter `editable()`; engine-agnostic if the skill format is shared (agentskills.io), still hash-checked.

**Accept:**

- [x] Claude + Codex surfaces visible in one graph with `engine` tags.
- [x] Engine filter UI works; legend explains engines.
- [x] No false Cursor rule/MCP semantics on foreign files.
- [x] Fixtures + goldens + per-engine docs; `pnpm check` green.

**Status (2026-10-15): done.** Verifier: `pnpm check` (355 tests) + `pnpm build` green; multi-engine adapters merge Cursor/Claude/Codex with per-node `engine` (`multi.ts`, `claude`/`codex` adapters); toolbar All/Cursor/Claude/Codex chips + badges/tints + legend (`Toolbar.tsx`, `Legend.tsx`, `model.ts`); `.claude/rules` diagnostic-only / MCP Cursor-only (no foreign rule activation); fixtures `claude-basic` + `codex-basic` goldens; per-engine `supported-formats.md` + README full-picture blurb; secrets clear on P2 diff; no `Co-authored-by` on P2 commits.

---

## P3 — Visual system (CSS / graph chrome)

**Goal:** coherent, non-generic UI that scales once engines exist.

1. Design tokens, typography, atmosphere in `src/web/styles.css` (avoid purple-AI / cream-serif clichés).
2. Richer nodes (kind + engine + activation hint), evidence edges, selection/focus chrome — still D3 SVG (`graph-render.ts`).
3. Optional force layout toggle only if focus mode isn’t enough.
4. Fix deferred M2 polish (pin prune, view-state queue, StrictMode pin schedule).

**Accept:**

- [ ] Tokens + chrome applied; keyboard NodeList + selection still work.
- [ ] Graph remains D3 SVG (no WebGL).
- [ ] Deferred M2 polish items addressed or explicitly deferred with rationale; `pnpm check` green.

---

## P4 — Markdown preview + better editing

**Goal:** read MD as documents; edit skills properly.

1. Sanitized `MarkdownPreview` (Preview | Source).
2. CodeMirror 6 split editor for skills.
3. Existing `/api/edits/*` + EOL/BOM preservation.
4. XSS: http(s) links only; no rich preview of secret-bearing paths.

**Accept:**

- [ ] Skill CodeMirror + live MD preview; other MD read-only rendered preview.
- [ ] Preview sanitization: http(s) only; secret-bearing paths not richly previewed.
- [ ] Edit apply still hash-checked; `pnpm check` green.

---

## P5 — Stretch (not scheduled)

- Watch + rescan (chokidar)
- ELK layout
- Editable rules/agents
- Playwright drag-to-pin
- Export graph JSON / PNG
- Hosted upload
- User-level config (`~/.cursor`)
- Optional AI **annotations** only (`evidence: annotation`, off by default)

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Invented Cursor/Claude/Codex semantics | Verify against docs; unverified → attributes/diagnostics only. |
| Glob fan-out explodes the graph | Cap matches per glob; diagnostic when empty or capped. |
| Multi-engine false unification | Side-by-side engines with labels; no merged activation model. |
| XSS via MD preview | Sanitize; http(s) only; no rich preview of secret-bearing paths. |
| Visual polish before engine truth | Phase order: semantics → engines → chrome → editor. |
| Push / remote mistakes | Hook blocks force-push and non-`origin` remotes; trailer-free commits only. |
