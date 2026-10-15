# Cloud Agents and Automations

How this template relates to Cursor **Cloud Agents** and **Automations**. The local lean loop remains the default; cloud and automations are optional complements.

## Three layers

| Layer | Where | Typical use |
|-------|--------|-------------|
| **Local lean loop** | Cursor Agent in the app workspace | explore → Plan mode / planner → builder → STOP; R/S/V on request or ship |
| **Cloud Agents** | Async agents (often PR / backlog) | Longer or parallel work without tying up the local session |
| **Automations** | Triggers (git, Slack, cron, etc.) | Recurring or event-driven runs against a repo |

This template does **not** require Automations (or Cloud Agents) to work. Adopt + overlay + local roles are enough.

## Same contract when committed

When `AGENTS.md`, `.cursor/rules/`, agents, skills, and hooks are committed in the app:

- Cloud Agents and Automations that check out that repo should follow the **same** orchestration contract and failClosed hooks.
- Do not expect a different “cloud-only” SDLC — keep one source of truth in-repo.

## Suggested automation ideas (apps only; docs only)

Optional ideas for apps that adopt this template — **do not** create real Cursor Automations YAML or configs in this template repo:

- **PR opened / updated** → security-oriented or Bugbot-style pass (complement to in-repo `reviewer` / `security`; see `.cursor/BUGBOT.md`)
- **Scheduled** → dependency / vuln skim (report only; human decides upgrades)

Wire these in the **app** (or org Automations UI) if useful. Keep the lean loop lean — don’t enable unused triggers.

## Integrations

Reach-outside-repo tools (tickets, observability, chat): see [`docs/mcp.md`](mcp.md). Do not bake a project `.cursor/mcp.json` with servers by default.

## Reminder

Day-to-day build still ends at **STOP** after builder unless the user asks for R/S/V or ship / merge-ready. Automations are optional extras, not a replacement for that loop.
