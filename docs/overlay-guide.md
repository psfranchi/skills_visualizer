# Overlay guide

Overlays hold **stack-specific** facts generated **from the target app**. This template does not ship filled overlays (no Laravel/Next pack included).

## Slot layout

```
overlays/_template/                 # empty instructions only — copy this
overlays/<stack>/                   # created later by fill-stack-overlay
  AGENTS.stack.md
  rules/
    stack.mdc                       # → .cursor/rules/90-stack.mdc
  skills/
    stack-commands/SKILL.md
```

## When to create an overlay

After `adopt-base` (or whenever the app has no `90-stack.mdc` yet):

1. Open the **app** repo (not only this template).
2. Run skill **`fill-stack-overlay`**.
3. It detects the stack (e.g. Laravel via `composer.json`), copies `_template` → `overlays/<stack>/`, fills commands/layout from the repo, and wires rules.

## What belongs in an overlay

- Language/framework and layout paths
- Canonical commands: test, lint/format, build, migrate, serve
- Preferred / banned patterns for **this** repo
- Auth, env, testing conventions (names only for secrets)

## What does not belong

- Role definitions — `.cursor/agents/`
- Global SDLC / safety — `.cursor/rules/00-*.mdc` / `10-*.mdc`
- Hard-coded facts about some other project you once used

## Manual fallback

```bash
cp -R overlays/_template overlays/<stack>
# edit the three files, then:
cp overlays/<stack>/rules/stack.mdc .cursor/rules/90-stack.mdc
rm -f .cursor/rules/90-stack-placeholder.mdc
# Required — Cursor indexes .cursor/skills reliably; overlay copy alone is insufficient:
cp -R overlays/<stack>/skills/stack-commands .cursor/skills/stack-commands
```

Update `AGENTS.md` **Stack** section to match (point at both overlay source and `.cursor/skills/stack-commands/`).
