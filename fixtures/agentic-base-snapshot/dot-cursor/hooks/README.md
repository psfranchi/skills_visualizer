# Project hooks (P0)

Deterministic Cursor hooks — **python3 stdlib only** (no jq).

| Hook | Event | Script |
|------|--------|--------|
| Block dangerous git | `beforeShellExecution` | `block-dangerous-git.py` |
| Scan secrets in edits | `preToolUse` (`Write` / `StrReplace`) | `scan-secrets-pretool.py` |
| Scan secrets in prompt | `beforeSubmitPrompt` | `scan-secrets-prompt.py` |

Configured in `.cursor/hooks.json`.

## Behavior

- **block-dangerous-git:** deny `git push` (any, incl. force), `reset --hard`, `clean -f*`, `filter-branch`, interactive rebase; **ask** on `commit --amend` and non-interactive `rebase`; allow normal status/diff/log/commit. User owns push; agents must not push; commit only when the user explicitly asked (amend still needs UI ask).
- **scan-secrets-\*:** high-confidence patterns only (AWS `AKIA…`, PEM/private keys, `ghp_` / `gho_` / `github_pat_`, Slack `xox*`, api_key assignments with 20+ chars, URL user:pass — except `localhost` / `127.0.0.1` dev URLs). Mentions of `.env` without values are not blocked.

## failClosed

All three entries use `"failClosed": true`. If a hook crashes, times out, exits non-zero, or returns invalid JSON, Cursor **blocks** the action instead of failing open.

**Recovery:** if scripts are missing while failClosed hooks are still cached, create the three `.py` scripts (executable) before restoring `hooks.json`, or temporarily make `hooks.json` unreadable so Cursor reloads with no project hooks — then write scripts first, `hooks.json` last.
