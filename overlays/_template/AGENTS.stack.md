# Stack brief (template)

Replace placeholders after detecting the target app. Keep short.

## Identity

- Stack name: `<stack>`
- Language / runtime: `<e.g. PHP 8.x, Node 20, Go 1.x>`
- Framework: `<detected framework or none>`

## Layout

- App code: `<path>`
- Tests: `<path>`
- Config / env: `<path>` — key names only, never secret values

## Canonical commands

Prefer the `stack-commands` skill. Summary:

| Action | Command |
|--------|---------|
| Test | `<cmd>` |
| Lint / format | `<cmd>` |
| Dev / serve | `<cmd>` |
| Build | `<cmd>` |

## Conventions

- Preferred patterns: …
- Banned / avoid: …
- Testing notes: …

## Wire-up

1. Copy `rules/stack.mdc` → project `.cursor/rules/90-stack.mdc`
2. Point root `AGENTS.md` Stack section here
3. **Always** copy `skills/stack-commands/` → `.cursor/skills/stack-commands/` (runtime for agents; overlay path remains source of truth)
