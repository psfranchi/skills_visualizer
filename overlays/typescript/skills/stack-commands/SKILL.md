---
name: stack-commands
description: >-
  Canonical test, lint, build, and serve commands for this stack overlay.
  Use when running checks, verifying work, or when unsure which script to invoke.
---

# Stack commands (`typescript`)

Run from the project root unless noted. Toolchain: `nvm use` (Node 24.22.0 from `.nvmrc`), `corepack enable` (pnpm 12.11.2 from `packageManager`), then `pnpm install`.

## Test

```bash
pnpm test          # vitest run
pnpm test:watch    # vitest
```

## Lint / format

```bash
pnpm lint          # biome check .
pnpm format        # biome check --write .
pnpm typecheck     # tsc -p tsconfig.{core,node,web}.json
pnpm check         # lint + typecheck + test (single gate)
```

## Dev / serve

```bash
pnpm dev [dir]               # Vite + API on 127.0.0.1
pnpm start [dir]             # serve built dist/web + API
pnpm scan <dir> [--out f]    # print graph JSON
```

## Build

```bash
pnpm build         # vite build → dist/web/
```

## Other

- No migrations, seeds, or env files.
- Until M2 of `docs/mvp-plan.md` lands, `dev` / `start` are CLI stubs that exit 1.
- Golden graphs: `pnpm test -u` rewrites `fixtures/*/expected.graph.json` after an intended change.
