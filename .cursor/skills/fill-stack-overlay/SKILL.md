---
name: fill-stack-overlay
description: >-
  Detect the app tech stack from the repo and generate overlays/<stack>/ from
  overlays/_template (commands, dirs, conventions). Use after adopt-base, when
  the project is Laravel/Next/Node/etc., or when the user says create overlay /
  fill stack / wire stack.
---

# Fill stack overlay

## Goal

This template ships **no** baked stack overlays. After install, generate one from the **target app** by reading the repo. Prefer discovered facts over generics.

## Steps

```
Overlay progress:
- [ ] 1. Detect stack id from the target app
- [ ] 2. Copy overlays/_template → overlays/<stack>
- [ ] 3. Discover commands and layout in-repo
- [ ] 4. Fill AGENTS.stack.md, rules/stack.mdc, skills/stack-commands/SKILL.md
- [ ] 5. Wire into .cursor/rules/90-stack.mdc + AGENTS.md Stack section
- [ ] 6. Always copy stack-commands → .cursor/skills/stack-commands/
- [ ] 7. Sanity-check: core agents stay stack-agnostic
```

## 1. Detect stack id

Inspect the target project root (do not invent):

| Evidence | Stack id |
|----------|----------|
| `composer.json` requires `laravel/framework` | `laravel` |
| `artisan` present + PHP app layout | `laravel` (confirm via composer) |
| `next.config.*` + React app | `next` |
| `package.json` only, no Next/Nuxt/etc. | `node` (or ask for a clearer name) |
| `go.mod` | `go` |
| `pyproject.toml` / `manage.py` (Django) | ask or use `django` / `python` |
| Unclear | Ask the user for a short stack id (`myapi`, etc.) |

Use lowercase folder names: `overlays/laravel`, not `overlays/Laravel`.

## 2. Scaffold from template

```bash
cp -R overlays/_template "overlays/<stack>"
```

If `overlays/_template` is missing (already copied only core files), recreate the three-file slot from `docs/overlay-guide.md`.

## 3. Discover (read, do not guess)

From the target app:

- Manifests and scripts (`composer.json`, `package.json`, Makefile, etc.)
- Test / lint / format / build / serve commands that actually exist
- Source roots, routes/entrypoints, test dirs
- Env pattern (`.env.example`) — **key names only**, never values
- Testing conventions already used in the repo

### If stack is Laravel (example of discovery, not a baked overlay)

Look for and document only what exists:

- Test: `composer test` and/or `php artisan test`
- Format: `vendor/bin/pint` if present
- Dev: scripts in `composer.json` / `npm run dev`
- Layout: `app/`, `routes/`, `resources/`, `database/`, `tests/`, `public/`
- Do not commit `.env`; keep secrets in env

Same idea for any other stack: read the project, write the overlay.

## 4. Fill + wire

Keep each overlay file short. Replace every `<placeholder>`.

Then:

1. Copy `overlays/<stack>/rules/stack.mdc` → `.cursor/rules/90-stack.mdc`
2. Remove `.cursor/rules/90-stack-placeholder.mdc` if present
3. Update root `AGENTS.md` **Stack** section with overlay name + paths
4. **Always** copy `overlays/<stack>/skills/stack-commands/` → `.cursor/skills/stack-commands/` (Cursor indexes `.cursor/skills` reliably; overlay-only copy is insufficient). Skill files are Markdown — `chmod` / executable bits are N/A.

## Done when

- `overlays/<stack>/` exists and is filled from this repo
- `.cursor/skills/stack-commands/` matches the overlay’s `skills/stack-commands/`
- Agents can run test/lint from the overlay / stack-commands skill alone
- No other stack’s assumptions sit in core agents/rules
