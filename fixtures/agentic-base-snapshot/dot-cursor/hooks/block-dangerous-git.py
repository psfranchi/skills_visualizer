#!/usr/bin/env python3
"""beforeShellExecution: gate dangerous git commands."""

from __future__ import annotations

import json
import re
import sys


def _respond(
    permission: str,
    user_message: str | None = None,
    agent_message: str | None = None,
) -> None:
    out: dict = {"permission": permission}
    if user_message:
        out["user_message"] = user_message
    if agent_message:
        out["agent_message"] = agent_message
    print(json.dumps(out))
    sys.exit(0)


def _normalize(command: str) -> str:
    return " ".join(command.strip().split())


def main() -> None:
    try:
        raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        _respond("allow")

    command = data.get("command") or ""
    if not isinstance(command, str):
        command = str(command)
    cmd = _normalize(command)
    lower = cmd.lower()

    # Deny: any git push (including force)
    if re.search(r"(^|[;&|]\s*|&&\s*|\|\|\s*)git(\s+-C\s+\S+)?\s+push\b", lower):
        _respond(
            "deny",
            user_message=(
                "Blocked: git push. You own remotes — agents must never push "
                "(including force-push). Push yourself when ready."
            ),
            agent_message=(
                "Denied: agents must not git push or force-push. The user owns "
                "push. Do not retry push; ask the user to push if needed. "
                "Only commit when the user explicitly asked."
            ),
        )

    # Deny: git reset --hard
    if re.search(r"\bgit(\s+-C\s+\S+)?\s+reset\b[^\n]*--hard\b", lower):
        _respond(
            "deny",
            user_message="Blocked: git reset --hard (destructive).",
            agent_message=(
                "Denied: git reset --hard is destructive. Agents must not run it."
            ),
        )

    # Deny: git clean -f / -fd (and similar force cleans)
    if re.search(
        r"\bgit(\s+-C\s+\S+)?\s+clean\b[^\n]*-(?:f|fd|ffd|dff)\b", lower
    ) or re.search(
        r"\bgit(\s+-C\s+\S+)?\s+clean\b[^\n]*--force\b", lower
    ):
        _respond(
            "deny",
            user_message="Blocked: git clean with force (destructive).",
            agent_message=(
                "Denied: git clean -f/-fd is destructive. Agents must not run it."
            ),
        )

    # Deny: git filter-branch
    if re.search(r"\bgit(\s+-C\s+\S+)?\s+filter-branch\b", lower):
        _respond(
            "deny",
            user_message="Blocked: git filter-branch (history rewrite).",
            agent_message=(
                "Denied: git filter-branch rewrites history. Agents must not run it."
            ),
        )

    # Deny: interactive rebase
    if re.search(
        r"\bgit(\s+-C\s+\S+)?\s+rebase\b[^\n]*(-i|--interactive)\b", lower
    ):
        _respond(
            "deny",
            user_message="Blocked: interactive git rebase.",
            agent_message=(
                "Denied: interactive rebase (git rebase -i) is not allowed for agents."
            ),
        )

    # Ask: git commit --amend
    if re.search(r"\bgit(\s+-C\s+\S+)?\s+commit\b[^\n]*--amend\b", lower):
        _respond(
            "ask",
            user_message=(
                "Confirm git commit --amend. Agents may commit only when you "
                "explicitly asked; amend still needs your approval."
            ),
            agent_message=(
                "Amend requires user confirmation. Only commit when the user "
                "explicitly asked; amend still needs UI ask. Do not push."
            ),
        )

    # Ask: non-interactive rebase
    if re.search(r"\bgit(\s+-C\s+\S+)?\s+rebase\b", lower):
        _respond(
            "ask",
            user_message="Confirm non-interactive git rebase.",
            agent_message=(
                "git rebase requires user confirmation before running. Do not push."
            ),
        )

    _respond("allow")


if __name__ == "__main__":
    main()
