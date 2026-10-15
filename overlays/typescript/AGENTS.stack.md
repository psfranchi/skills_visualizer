# Stack brief (`typescript`)

## Identity

- Stack name: `typescript`
- Language / runtime: TypeScript 7 on Node 24.22.0 (`.nvmrc`), pnpm 12.11.2 via corepack (`packageManager`), ESM (`"type": "module"`)
- Framework: React 19 + Vite 8 (web), Hono 4 (API), D3 7 + Dagre 3 (graph), Vitest 5, Biome 2

## Layout

- Pure core (no Node APIs): `src/core/`, `src/scanner/` (adapters in `src/scanner/adapters/<client>/`), `src/layout/`, `src/source-editing/`
- Server: `src/server/app.ts` (runtime-agnostic Hono routes), `src/server/node/` (fs, local `FileSource`)
- CLI: `src/cli/main.ts` (`scan`, `dev`, `serve`)
- Web: `src/web/` (Vite root; builds to `dist/web/`)
- Tests: `*.test.ts` next to the code they test; Node-only test helpers in `src/test-support/`
- Fixtures: `fixtures/<name>/` scan inputs; golden graphs as `expected.graph.json`
- Config / env: none yet — no `.env` required

## Canonical commands

Prefer the `stack-commands` skill. Summary:

| Action | Command |
|--------|---------|
| Test | `pnpm test` (`pnpm test:watch`) |
| Lint / format | `pnpm lint` / `pnpm format` |
| Typecheck | `pnpm typecheck` |
| All gates | `pnpm check` |
| Dev / serve | `pnpm dev [dir]` / `pnpm start [dir]` |
| Scan | `pnpm scan <dir> [--out <file>]` |
| Build | `pnpm build` |

## Conventions

- Preferred patterns: pure core uses Web-standard APIs only (`TextDecoder`, `globalThis.crypto.subtle`) so it runs in Node and the browser; I/O goes through the `FileSource` interface; zod schemas are the source of truth for types; D3 owns the graph `<svg>` subtree, React owns panels.
- Banned / avoid: `node:*`, `hono`, `react`, `d3`, `tinyglobby`, `src/server`, `src/web`, `src/cli` imports inside the pure core folders (enforced by `tsconfig.core.json` + Biome); `node:*` in `src/web`; React Flow; reformatting `fixtures/`.
- Testing notes: core tests use `MemoryFileSource` only; golden files via `toMatchFileSnapshot`; fixture secrets are `SENTINEL-NOT-A-SECRET-*` sentinels and must never appear in output.
- Fixtures store agent config under renamed names (`dot-cursor/`, `AGENTS.fixture.md`, …) so Cursor never loads them; load them only via `loadFixture` / `materializeFixture` in `src/test-support/fixtures.ts`.

## Wire-up

1. Copy `rules/stack.mdc` → project `.cursor/rules/90-stack.mdc`
2. Point root `AGENTS.md` Stack section here
3. **Always** copy `skills/stack-commands/` → `.cursor/skills/stack-commands/` (runtime for agents; overlay path remains source of truth)
