# Skills Visualizer — MVP Plan

Status: approved 2026-10-15. Product brief: [`agent-architecture-explorer-plan.md`](agent-architecture-explorer-plan.md).

## Goal

Local web app (one dev command; Node server + browser UI) that scans a repo's Cursor agent configuration into a versioned graph with provenance, renders it with D3/Dagre, shows source evidence for every node and edge, and safely edits a skill's `SKILL.md` through diff preview and hash-checked apply. The design must not block a later hosted mode where users upload their files.

## Decisions

| Topic | Decision |
| --- | --- |
| Deployment | Local now. Hosted/upload mode later; not built in MVP, but the architecture must not block it (`FileSource` abstraction + capability flags). |
| First adapter | Cursor: `AGENTS.md`, skills, rules, subagents, `.cursor/mcp.json`. |
| Discovery roots | All roots Cursor documents (`.cursor`, `.agents`, `.claude`, `.codex` skills/agents), each node tagged by root. |
| Reference edges | Markdown links and rule `@mentions` are `explicit`. Backtick paths that resolve to real files are `inferred` (with explanation), hidden by default in the UI. |
| Ignore policy | Fixed ignore list in MVP; `.gitignore` support later. |
| OS support | Linux and macOS. |
| Real-world fixture | Commit a frozen snapshot of `~/projects/agentic_base` `.cursor/` + `AGENTS.md`. |
| Fixture isolation | Fixtures are stored with renamed agent-config names (e.g. `dot-cursor/`, `AGENTS.fixture.md`) so Cursor never loads them as real config; a test helper maps them back to real names when loading into `MemoryFileSource` or materializing a temp dir. |
| Visualization | D3 (SVG) owns the graph subtree; React owns panels. Dagre for hierarchy. Not React Flow. |
| Packaging | Single package (no monorepo), module folders with enforced boundaries. |

### Stack (latest versions checked 2026-10-15)

Node 24.22.0 LTS (nvm, `.nvmrc`) · pnpm 12.11.2 (corepack, `packageManager`) · React 19.3 · Vite 8.3 · d3 7.9 · @dagrejs/dagre 3.1 · Hono 4.13 + @hono/node-server 2.1 · unified 11 + remark-parse 11 + remark-frontmatter 5 · yaml 2.9 · zod 4.6 · tinyglobby 0.2 · diff 9 · TypeScript 7.0 (fallback to 5.x for typecheck if tooling lags) · Biome 2.5 · Vitest 5 · tsx 4.23. Later: chokidar 5, CodeMirror 6, ELK.js.

## Constraints / non-goals

- **Pure core:** `src/core`, `src/scanner`, `src/layout`, `src/source-editing` never import `node:*`, `hono`, `react`, `src/server`, or `src/web`. Only Web-standard APIs (`TextDecoder`, `globalThis.crypto.subtle`), so they run in Node 24 and in the browser.
- **Not in MVP:** hosted/upload mode, watcher, force view, ELK, relationship edits, user-level config (`~/.cursor`), AI inference.
- Scanning never writes and never executes anything (no scripts, no MCP servers).
- MCP secret values never reach graph JSON, API responses, logs, or the UI.
- No invented semantics: no `tools:` field in skills; references are not executable flow.

### Cursor formats — verified against docs (cursor.com/docs, agentskills.io/specification)

- **`AGENTS.md`:** root and any subdirectory; nested files combine with parents, more specific wins.
- **Rules:** `.cursor/rules/**/*.mdc` (subfolders allowed; `.md` ignored). Frontmatter `description`, `globs` (comma-separated string), `alwaysApply`; four activation modes from their combination. `@file` in a body tells the agent to read that file (not inlined).
- **Skills:** roots `.cursor/skills/`, `.agents/skills/`, plus `.claude/skills/` and `.codex/skills/`; walked recursively; nested `.cursor/skills` in subdirectories are scoped to that directory. `name` must match the folder (lowercase, digits, single hyphens, ≤64 chars); `description` required (≤1024 chars). Cursor extras: `paths` (`globs` legacy fallback), `disable-model-invocation`, `icon`, `color`, `metadata`. agentskills.io extras: `license`, `compatibility`, `allowed-tools` (experimental).
- **Subagents:** `.cursor/agents/*.md`, plus `.claude/agents/`, `.codex/agents/` (`.cursor` wins on name conflict). Fields `name` (defaults to filename), `description`, `model` (defaults to `inherit`), `readonly`, `is_background`.
- **MCP:** `.cursor/mcp.json` = `{ mcpServers: { [name]: … } }`. stdio: `type`, `command`, `args`, `env`, `envFile`. Remote: `url`, `headers`, `auth{CLIENT_ID,CLIENT_SECRET,scopes}`. `${env:NAME}` interpolation.

### Not verified — surface as diagnostics/attributes, don't build semantics on them

- Nested `.cursor/rules/` or `.cursor/agents/` in subdirectories.
- Case sensitivity of `AGENTS.md`.
- Base directory for rule `@path` resolution (default: repo root, then relative to file; ambiguity → diagnostic).
- Whether `mcp.json` allows comments (strict `JSON.parse`; failure → error diagnostic).
- Whether rule globs / skill `paths` auto-attach to files (attributes only; no file-match edges).

## Proposed `package.json` scripts

Become the stack overlay's source of truth in M0.

| Script | Command | Intent |
| --- | --- | --- |
| `dev` | `tsx src/cli/main.ts dev` | `pnpm dev [dir]`: one process, Vite (JS API) with the Hono app mounted on `/api`, bound to 127.0.0.1 |
| `scan` | `tsx src/cli/main.ts scan` | `pnpm scan <dir> [--out f]` prints graph JSON |
| `start` | `tsx src/cli/main.ts serve` | Serves built `dist/web` + API |
| `build` | `vite build` | Web bundle |
| `test` / `test:watch` | `vitest run` / `vitest` | |
| `lint` / `format` | `biome check .` / `biome check --write .` | |
| `typecheck` | `tsc` per `tsconfig.{core,node,web}.json`, `--noEmit` | Fall back to TS 5.x if TS 7 can't |
| `check` | `lint && typecheck && test` | Single gate for the verifier |

## Files likely touched

- `package.json`, `pnpm-lock.yaml`, `.nvmrc`, `.gitignore`
- `tsconfig.json` + `tsconfig.core.json`, `tsconfig.node.json`, `tsconfig.web.json` (boundary enforcement)
- `biome.json`, `vite.config.ts`, `vitest.config.ts`
- `src/core/` — graph schema (zod), IDs, path normalization, hashing, `FileSource`, `MemoryFileSource`, graph builder
- `src/scanner/` — pipeline, Markdown/frontmatter parsing, link extraction; `src/scanner/adapters/cursor/`
- `src/layout/dagre.ts`
- `src/source-editing/` — edit planning, diff, validation, EOL/BOM restore
- `src/server/app.ts` — Hono routes; depends only on a `Services` interface so the web app can import its type
- `src/server/node/` — `LocalFileSource`, atomic writer, view-state store, `main.ts`
- `src/cli/main.ts` — `scan`, `dev`, `serve`
- `src/web/` — `main.tsx`, `App.tsx`, `GraphCanvas.tsx` (D3), `Inspector.tsx`, `Toolbar.tsx`, `NodeList.tsx`, `DiffPanel.tsx`, `api.ts` (Hono typed client)
- `fixtures/cursor-basic/`, `fixtures/cursor-edge/`, `fixtures/agentic-base-snapshot/` + `expected.graph.json`
- `overlays/typescript/` → `.cursor/rules/90-stack.mdc`, `.cursor/skills/stack-commands/`; `AGENTS.md` Stack section; remove `90-stack-placeholder.mdc`
- `docs/supported-formats.md`

## M0 — Scaffold, toolchain, overlay, fixtures

1. **Toolchain pins:** `.nvmrc` = `24.22.0`, `"packageManager": "pnpm@12.11.2"`, `"type": "module"`, `engines.node >=24`. Exact dependency versions.
2. **Boundary enforcement (light):**
   - `tsconfig.core.json`: `src/{core,scanner,layout,source-editing}`, `lib: ["ES2024","DOM"]`, `types: []` — a `node:` import fails typecheck.
   - `tsconfig.node.json`: `src/server`, `src/cli`, tests, with node types.
   - `tsconfig.web.json`: `src/web` + `src/server/app.ts` (type import), DOM, `jsx: react-jsx`.
   - Biome `overrides` + `noRestrictedImports`: block `node:*`, `hono`, `react`, `d3` in core folders; `node:*` in `src/web`.
3. **Skeleton:** `index.ts` stubs per module; `src/cli/main.ts` with `scan` stubbed; Vitest smoke test.
4. **Fixtures:**
   - `cursor-basic`: root + nested `AGENTS.md`; 3 skills with `references/` and `scripts/`; one shared reference; rules in a subfolder; 2 agents; `mcp.json` with stdio and remote servers.
   - `cursor-edge`: missing link target; reference cycle; unknown frontmatter fields with comments; malformed YAML; skill name ≠ folder; `.md` inside rules; `SKILL.md` outside any skill root; `node_modules/**/SKILL.md`; nested `apps/x/.cursor/skills`; CRLF and BOM files; symlink escaping the root (created in test setup).
   - `agentic-base-snapshot`: frozen copy of `~/projects/agentic_base/.cursor` + `AGENTS.md`.
   - Fake secrets use sentinel strings like `SENTINEL-NOT-A-SECRET-A1` that avoid `scan-secrets-pretool.py` patterns (no `api_key=` + 20+ chars, no `ghp_`, no PEM headers).
5. **Overlay:** once scripts exist, copy `overlays/_template` → `overlays/typescript/`; fill commands, layout (`src/*`, `fixtures/`, `*.test.ts` next to code), conventions (boundaries, no fs in core). Copy to `.cursor/rules/90-stack.mdc` and `.cursor/skills/stack-commands/`; delete the placeholder rule; update `AGENTS.md` Stack.
6. **Docs:** `docs/supported-formats.md` with the verified / not-verified lists above.

**Accept:**

- [ ] `pnpm install`, `pnpm check`, `pnpm build` pass.
- [ ] `import 'node:fs'` in `src/core` fails both typecheck and lint.
- [ ] Overlay wired.

## M1 — FileSource, Cursor adapter, graph JSON

Zod schemas are the source of truth; types come from `z.infer`.

```ts
type RepoPath = string & { __brand: 'RepoPath' };   // POSIX, relative, no '..', no NUL
interface FileSource {
  readonly id: string;                         // 'local:<abs>' | 'memory:<uuid>'
  readonly capabilities: { write: boolean; watch: boolean };
  list(): Promise<RepoPath[]>;                 // files only; source applies ignore list + symlink policy
  read(path: RepoPath): Promise<Uint8Array | null>;
}
interface WritableFileSource extends FileSource {
  replaceIfUnchanged(path: RepoPath, expectedHash: string, bytes: Uint8Array):
    Promise<{ ok: true; hash: string } | { ok: false; reason: 'conflict' | 'missing'; currentHash?: string }>;
}
interface ClientAdapter {
  id: 'cursor'; version: string;
  classify(paths: readonly RepoPath[]): Discovered[];        // pure path predicates
  parse(d: Discovered, file: LoadedFile): AdapterResult;     // nodes, unresolved refs, diagnostics
  editable(d: Discovered): boolean;                          // M3: SKILL.md only
}
type NodeKind = 'instruction'|'rule'|'skill'|'agent'|'file'|'script'|'mcp-config'|'mcp-server'|'directory';
type Relation = 'contains'|'references'|'applies-to'|'annotation';   // 'invokes'/'delegates-to' reserved
interface Span { offset: number; line: number; column: number }
interface SourceLocation { path: RepoPath; start?: Span; end?: Span; contentHash: string; adapter: string }
// AgentNode / AgentEdge / GraphDiagnostic per brief §6; AgentGraph adds:
//   schemaVersion: 1, source: { id, capabilities }, generatedBy: { adapter, version }
```

1. **Core** (`src/core`): `normalizeRepoPath` (rejects absolute, `..`, NUL, encoded traversal); `sha256Hex` via Web Crypto; strict UTF-8 decode (binary/invalid → diagnostic); `MemoryFileSource` (all unit tests + future upload mode); stable IDs (`skill:.cursor/skills/add-test`, `mcp-server:.cursor/mcp.json#name`, edges `${rel}:${src}->${tgt}#${ordinal}`); sorted output for determinism.
2. **`LocalFileSource`** (`src/server/node/`): tinyglobby with fixed ignore list (`node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `.venv`, `vendor`); explicitly keeps `.cursor`, `.agents`, `.claude`, `.codex`; no symlink following; `realpath` keeps every path inside the root; files over 1 MB skipped with a diagnostic.
3. **Parsing** (`src/scanner/markdown.ts`): unified + remark-parse + remark-frontmatter → mdast; `yaml` for frontmatter; frontmatter offsets made absolute. Local Markdown links/images → `references` (`explicit`), fragments stripped, paths URL-decoded. Backtick paths resolving to real files → `references` (`inferred`, with explanation).
4. **Cursor adapter:**
   - `AGENTS.md` → `applies-to` its directory (`derived`).
   - Rules → computed `activation` attribute; `@path` mentions → `references` (`explicit`).
   - Skills → `contains` files in their folder (`derived`); name/description checks → diagnostics; nested skill root → `applies-to` its directory. Nodes tagged with their discovery root.
   - Agents → name collisions across roots give the loser a "shadowed" diagnostic.
   - MCP → `mcp-config` `contains` one `mcp-server` per server. Redaction: `env`/`headers`/`auth` show keys only unless the value is a pure `${env:…}` reference; `url` loses userinfo and query string; `args` values after secret-looking flags are masked.
5. **Graph builder** (`src/core/graph.ts`): resolves references against the file set, creates `file`/`script` nodes for targets; missing targets → `unresolved-reference` diagnostic; cycles → info diagnostic only; multi-edges kept, duplicates removed.
6. **CLI:** `scan <dir> [--out]` prints JSON that passes zod validation.

**Tests:** golden file per fixture (`toMatchFileSnapshot` on `expected.graph.json`); every explicit edge has `provenance` and slicing the source at its offset returns the link text; sentinel secrets never appear in serialized output; path-boundary tests for `normalizeRepoPath` and `LocalFileSource` (symlinks, `..`); scan leaves the fixture directory hash unchanged; smoke scan of this repo finds its skills, agents and rules and does not treat `overlays/*/SKILL.md` as skills; core tests use `MemoryFileSource` only.

**Accept:**

- [ ] `pnpm scan <dir>` on `cursor-basic` (materialized to a temp dir with real names) prints valid schema-v1 JSON; `pnpm scan .` on this repo works.
- [ ] Diagnostics present for every `cursor-edge` case.
- [ ] No writes during a scan.

## M2 — Local server API + read-only viewer

```ts
interface Services {   // src/server/node implements it; a hosted mode would implement it differently
  meta(): Promise<{ sourceId: string; capabilities: FileSource['capabilities']; schemaVersion: 1 }>;
  graph(opts?: { rescan?: boolean }): Promise<AgentGraph>;
  file(path: RepoPath): Promise<{ path: RepoPath; text: string; hash: string }>;  // graph-known paths only; mcp.json → redacted text
  getView(): Promise<GraphViewState>; putView(v: GraphViewState): Promise<void>;
}
// Routes (chained Hono app, export type AppType):
//   GET /api/meta · GET /api/graph · POST /api/scan · GET /api/file?path= · GET|PUT /api/view-state
```

1. **`src/server/app.ts`:** zod validation via Hono `validator`; `Host` not `127.0.0.1`/`localhost` → 403 (DNS rebinding); mutating requests rejected on cross-site `Origin` or non-JSON content type.
2. **`src/server/node/main.ts`:** `dev` mounts the app into Vite via `getRequestListener` (fallback: Vite `server.proxy`); `serve` serves `dist/web`; root folder from CLI argument.
3. **View state** outside the repo, keyed by `sha256(realpath root)`: Linux `${XDG_STATE_HOME:-~/.local/state}/skills-visualizer/<hash>/view.json`; macOS `~/Library/Application Support/skills-visualizer/<hash>/view.json`. `SV_STATE_DIR` overrides both.
4. **Layout** (`src/layout/dagre.ts`): `layoutHierarchy(graph, { visibleIds, pinned }) → { nodes: Record<id,{x,y,w,h}>, edges: Record<id,{points}> }`; `multigraph: true`; pinned positions override Dagre; edges touching pinned nodes drawn straight.
5. **Web:** React renders `<svg>`; D3 owns the inner `<g>` (data joins, `d3-zoom`, `d3-drag`). Drag pins a node, debounced `PUT /api/view-state`. Toolbar: search, kind filters, show inferred edges toggle (off by default), fit, reset layout, rescan. Evidence legend. Inspector: attributes, diagnostics, incoming/outgoing edges with evidence and explanation, raw source with provenance range highlighted. Keyboard-accessible `NodeList` synced with selection.

**Tests:** route tests via `app.request()` with a fake `Services`; `/api/file` rejects traversal and paths not in the graph; sentinel secrets absent from every response; Host/Origin checks → 403; view-state round-trip writes only to the state dir and the repo hash is unchanged; layout handles disconnected nodes, cycles, multi-edges (assert edge endpoints map to node boxes; no pixel snapshots).

**Accept:**

- [ ] `pnpm dev <dir>` opens the graph (this repo, or a materialized `cursor-basic`).
- [ ] Selecting a node shows its source and evidence.
- [ ] Search and filters work.
- [ ] Drag/pin survives reload.
- [ ] Repo files stay byte-identical.

## M3 — Raw `SKILL.md` edit → diff → hash-checked apply → rescan

```ts
// POST /api/edits/preview { path, expectedHash, newText } → { diff, diagnostics, impact: { edgesAdded, edgesRemoved } }
// POST /api/edits/apply   { path, expectedHash, newText } → 200 { hash, graph } | 409 { currentHash } | 400/403
planReplace(original: Uint8Array, newText: string): { bytes: Uint8Array; eol: 'lf'|'crlf'; bom: boolean }  // restores EOL/BOM
```

1. Inspector edit mode (textarea) only when `capabilities.write` and `adapter.editable` are true.
2. Preview reparses with the Cursor adapter; malformed YAML blocks apply, spec warnings don't. Diff via `diff` (`createTwoFilesPatch`).
3. Apply: re-check path is a discovered `SKILL.md` → hash compare (mismatch → 409, file untouched) → temp file in same dir + rename, keeping file mode → refuse to write through a symlink → full rescan → UI keeps selection by node ID.
4. One file per apply; no multi-file atomicity claimed.

**Tests:** preservation (YAML comments, unknown fields, key order, CRLF, BOM, no trailing newline, Unicode, untouched regions byte-identical); conflict (external write between preview and apply → 409, file unchanged); path boundary (`../`, absolute, `%2e%2e`, escaping symlink, non-skill path, `mcp.json` → 400/403); single-file scope (directory hash diff touches only the target); end to end (edit → preview → apply → rescan reflects new description and links).

**Accept:**

- [ ] Only the intended file changes.
- [ ] Stale overwrite blocked.
- [ ] Reparse reflects the edit.

## Later (not detailed)

Relationship edits and annotations, force view, chokidar watcher, more adapters (Claude, Codex), hooks/commands, hosted/upload mode (read-only or patch download via capability flags), ELK, CodeMirror, `.gitignore`-aware discovery, analysis features, Windows support.

## Security backlog (from M1 security review)

High and Medium findings were fixed before M2. Deferred Low items, to address before any hosted/upload mode:

- `serverKeyOffset` in `src/scanner/adapters/cursor/mcp.ts` is quadratic in `mcp.json` size; compute all key offsets in one pass or cap server count.
- Unbounded recursion in `src/scanner/markdown.ts` (`visit`) and `src/core/graph.ts` (cycle search) can abort a scan on deeply nested input; use explicit stacks and wrap each `adapter.parse` in try/catch with a fixed `parse-failed` diagnostic.
- TOCTOU in `LocalFileSource.read`: open with `O_NOFOLLOW`, `fh.stat()` for regular file + size, read at most limit + 1 bytes, compare dev/inode with listing-time `lstat`.
- Multiline MCP args (`--token=X\ny`, `API_KEY=X\r`) bypass the flag / `NAME=` regexes in `redact.ts`; use the `s` flag and fail closed on args with control characters.
- `contentHash` of secret-bearing files (`.env*`, `*.pem`, `*.key`, `id_*`, `.npmrc`, `credentials*`) is exposed; omit it or use a per-process HMAC.

M2 requirements from the same review: the UI renders only `http`/`https` links (no `javascript:` etc.), and `source.id` (`local:<absolute path>`) must not be shown or exported where graphs could be shared.

## Risks / unknowns

- **TypeScript 7 tooling:** native compiler binary name, multi-config support, editor/Biome compatibility unconfirmed → fall back to TS 5.x for typecheck only.
- **Vite 8 + Vitest 5:** confirm version pairing and the Vite JS-API middleware mount in M0.
- **Textarea normalizes to LF:** EOL/BOM restore must be tested.
- **Write race:** small window between hash check and rename; acceptable locally, documented.
- **Secret hook vs fixtures:** use sentinel values only.
- **Real-repo drift:** frozen snapshots for golden tests; live repos for smoke checks only.
- **macOS:** case-insensitive filesystem may affect path identity and `AGENTS.md` matching; cover in path tests.

## Test plan

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm check` (proposed; the overlay becomes the source of truth after M0). Every behavior change gets a Vitest test. Golden graphs must be deterministic.

## Acceptance criteria (overall)

- [ ] M0–M3 criteria met; `pnpm check` and `pnpm build` green at every milestone.
- [ ] Core modules have no `node:` imports (tsconfig + Biome) and are tested only through `MemoryFileSource`.
- [ ] No secret sentinel in CLI output, API responses, or UI.
- [ ] Every explicit edge resolves to inspectable source evidence; scanning and viewing never modify the repo.
- [ ] Overlay and `AGENTS.md` Stack section list the real scripts.
