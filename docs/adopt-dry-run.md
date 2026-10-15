# Adopt dry-run (prove install)

Procedure to prove `adopt-base` + `fill-stack-overlay` against a tiny stub app. Use when validating the template after changes, or teaching install without touching a real product.

## Setup

Preferred (sibling layout, same as real apps):

1. From the parent of `agentic_base`, copy the smoke stub next to the template:

   ```bash
   cp -R agentic_base/examples/smoke-app ./smoke-app
   ```

2. Open `agentic_base` in Cursor and prompt:

   ```text
   Use this as the agentic template for ../smoke-app
   ```

   (`adopt-base` into `../smoke-app`, then `fill-stack-overlay` on the target.)

Alternate: if you keep the stub only under `examples/smoke-app`, adopt into that path only when your workflow supports a non-sibling target — sibling `../smoke-app` is the documented default.

`examples/` is **template-only** — `adopt-base` does **not** copy `examples/` into apps. The smoke app is the dry-run **source**, not something installed into products.

## Checklist (target after adopt + overlay)

Confirm on the target (e.g. `../smoke-app`):

- [ ] Install did **not** prompt for subagent models
- [ ] `.cursor/agents/` — explorer, planner, builder, reviewer, security, verifier; all `model: inherit`, matching the `AGENTS.md` **Subagent models** table
- [ ] `.cursor/rules/` — core, SDLC, orchestrator, communication, stack rule (placeholder replaced or overlay-wired)
- [ ] `.cursor/skills/` — template skills including new playbooks; **`stack-commands`** present after fill
- [ ] `.cursor/hooks.json` + `.cursor/hooks/` (scripts executable)
- [ ] `.cursor/BUGBOT.md`
- [ ] `docs/` — workflow, overlay-guide, recommended-skills, mcp, **cloud-and-automations**, **adopt-dry-run** (and others copied by adopt)
- [ ] `docs/agentic-base/VERSION` + `docs/agentic-base/CHANGELOG.md`
- [ ] `fill-stack-overlay` created `overlays/<stack>/` (smoke stub should detect **node**) and copied `stack-commands` → `.cursor/skills/stack-commands/`
- [ ] **No secrets** copied — no `.env` with values, no tokens in hooks/skills/docs from the template

## Smoke stub

See [`examples/smoke-app/`](../examples/smoke-app/) — minimal Node package so overlay detection can pick `node`. Not a product.
