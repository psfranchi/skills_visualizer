#!/usr/bin/env python3
"""beforeShellExecution: gate dangerous git commands."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

# This project only: agents may push to this GitHub repo (non-force).
_ALLOWED_PUSH_REMOTE = re.compile(
    r"^(?:git@github\.com:|https://github\.com/)psfranchi/skills_visualizer(?:\.git)?/?$",
    re.IGNORECASE,
)

_FORCE_PUSH = re.compile(
    r"(?:^|\s)(?:--force|--force-with-lease|-f)(?:\s|=|$)",
    re.IGNORECASE,
)

_GIT_PUSH = re.compile(
    r"(^|[;&|]\s*|&&\s*|\|\|\s*)git(\s+-C\s+(?P<cwd>\S+))?\s+push\b(?P<rest>.*)$",
    re.IGNORECASE,
)


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


def _repo_root(git_c: str | None) -> Path:
    if git_c:
        return Path(git_c).expanduser().resolve()
    return Path.cwd()


def _remote_url(name: str, cwd: Path) -> str | None:
    try:
        out = subprocess.run(
            ["git", "remote", "get-url", name],
            cwd=cwd,
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if out.returncode != 0:
        return None
    return out.stdout.strip()


def _upstream_remote(cwd: Path) -> str | None:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
            cwd=cwd,
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if out.returncode != 0:
        return None
    # e.g. origin/master
    ref = out.stdout.strip()
    if "/" not in ref:
        return None
    return ref.split("/", 1)[0]


def _push_target_url(rest: str, cwd: Path) -> str | None:
    """Resolve the remote URL a `git push …` would use."""
    tokens = rest.split()
    # Drop known long options that take a value we might confuse for a remote.
    skip_next = False
    positional: list[str] = []
    for tok in tokens:
        if skip_next:
            skip_next = False
            continue
        if tok.startswith("-"):
            # Options that take a separate argument
            if tok in {
                "-o",
                "--push-option",
                "--repo",
                "--receive-pack",
                "--exec",
                "-c",
            } or tok.startswith("--push-option="):
                if "=" not in tok and tok in {
                    "-o",
                    "--push-option",
                    "--repo",
                    "--receive-pack",
                    "--exec",
                    "-c",
                }:
                    skip_next = True
                continue
            continue
        positional.append(tok)

    if positional:
        target = positional[0]
        if ":" in target or "/" in target and (
            target.startswith("git@")
            or target.startswith("http://")
            or target.startswith("https://")
            or target.startswith("ssh://")
        ):
            return target
        return _remote_url(target, cwd)

    upstream = _upstream_remote(cwd)
    if upstream:
        return _remote_url(upstream, cwd)
    return _remote_url("origin", cwd)


def _gate_push(cmd: str) -> None:
    m = _GIT_PUSH.search(cmd)
    if not m:
        return

    rest = m.group("rest") or ""
    if _FORCE_PUSH.search(rest) or _FORCE_PUSH.search(cmd):
        _respond(
            "deny",
            user_message="Blocked: git force-push is never allowed for agents.",
            agent_message=(
                "Denied: force-push (--force / -f / --force-with-lease) is blocked. "
                "Do not retry with force."
            ),
        )

    cwd = _repo_root(m.group("cwd"))
    url = _push_target_url(rest, cwd)
    if url and _ALLOWED_PUSH_REMOTE.match(url.strip()):
        return  # allow this push (fall through to later checks / final allow)

    _respond(
        "deny",
        user_message=(
            "Blocked: git push only allowed to "
            "git@github.com:psfranchi/skills_visualizer.git (non-force). "
            f"Resolved target: {url or '(unknown)'}."
        ),
        agent_message=(
            "Denied: push is restricted to this project's GitHub remote "
            "(psfranchi/skills_visualizer). Force-push is always denied. "
            "Do not push to other remotes or raw URLs."
        ),
    )


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

    # Push: allow only non-force to psfranchi/skills_visualizer
    if re.search(r"(^|[;&|]\s*|&&\s*|\|\|\s*)git(\s+-C\s+\S+)?\s+push\b", lower):
        _gate_push(cmd)

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
    ) or re.search(r"\bgit(\s+-C\s+\S+)?\s+clean\b[^\n]*--force\b", lower):
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
                "explicitly asked; amend still needs UI ask."
            ),
        )

    # Ask: non-interactive rebase
    if re.search(r"\bgit(\s+-C\s+\S+)?\s+rebase\b", lower):
        _respond(
            "ask",
            user_message="Confirm non-interactive git rebase.",
            agent_message=(
                "git rebase requires user confirmation before running."
            ),
        )

    _respond("allow")


if __name__ == "__main__":
    main()
