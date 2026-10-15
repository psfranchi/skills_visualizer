# MCP / integrations

Optional reach-outside-repo tools for Cursor agents. This template does **not** ship a project `.cursor/mcp.json` with servers baked in — enable only what your team needs.

## Principles

- MCP complements the lean loop (`docs/workflow.md`); it does not replace explore → plan → build → STOP.
- Don’t flood the session with unused servers — enable per role / task when useful.
- Secrets stay in env or Cursor MCP config — **never** commit tokens or API keys.

## Optional MCPs by role (examples, not mandates)

| Role / need | Example | Notes |
|-------------|---------|--------|
| PRs / issues | GitHub (`gh` CLI and/or `user-github` MCP) | Ship, PR create/review |
| Tickets / planning | Linear or Jira | Planner context; ticket status |
| Incidents / debug | Sentry, Datadog | Later debug workflows — not required for day-to-day build |
| Chat / notify | Slack | Rare for builder; prefer human-driven notify |

Pick what matches your stack and org. Skip the rest.

## Config and secrets

- Prefer user/team MCP settings in Cursor over committing project `mcp.json`.
- If you add a local `.cursor/mcp.json`, keep it empty of secrets; use env vars for credentials.
- Do not commit tokens, PATs, or webhook URLs.

## Cloud Agents / team MCP

For shared or Cloud Agent MCP setup, use the Cursor dashboard / team MCP admin when relevant — not a heavy baked-in repo config.

## Lean loop reminder

MCP is for **outside the repo** (tickets, PRs, observability). In-repo search stays with **explorer** / `explore-codebase`. Don’t enable every server “just in case.”
