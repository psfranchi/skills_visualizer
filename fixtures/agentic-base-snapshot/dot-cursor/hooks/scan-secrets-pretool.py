#!/usr/bin/env python3
"""preToolUse: deny Write/StrReplace payloads that look like secrets."""

from __future__ import annotations

import json
import re
import sys
from typing import Any

SECRET_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN(?: RSA| OPENSSH| EC)? PRIVATE KEY-----"),
    re.compile(r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----"),
    re.compile(r"-----BEGIN [A-Z0-9][A-Z0-9 \-]{2,40}-----"),
    re.compile(r"\bghp_[A-Za-z0-9]{20,}"),
    re.compile(r"\bgho_[A-Za-z0-9]{20,}"),
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}"),
    re.compile(
        r"api[_-]?key\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{20,}",
        re.IGNORECASE,
    ),
]

# user:pass@host in URLs; local dev hosts are exempt (e.g. postgres://u:p@localhost/db).
URL_CREDENTIALS = re.compile(r"://[^\s:/@]+:[^\s@]+@([^\s/:?#]+)")
LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1"})


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


def _collect_strings(value: Any, out: list[str], depth: int = 0) -> None:
    if depth > 8:
        return
    if isinstance(value, str):
        out.append(value)
        # Nested JSON string
        s = value.strip()
        if s and s[0] in "{[":
            try:
                _collect_strings(json.loads(s), out, depth + 1)
            except json.JSONDecodeError:
                pass
        return
    if isinstance(value, dict):
        for k, v in value.items():
            if k in (
                "contents",
                "new_string",
                "old_string",
                "tool_input",
                "arguments",
                "content",
                "text",
                "body",
            ):
                _collect_strings(v, out, depth + 1)
            else:
                _collect_strings(v, out, depth + 1)
        return
    if isinstance(value, list):
        for item in value:
            _collect_strings(item, out, depth + 1)


def _has_secret(text: str) -> bool:
    for pat in SECRET_PATTERNS:
        if pat.search(text):
            return True
    return any(
        m.group(1).lower() not in LOCAL_HOSTS for m in URL_CREDENTIALS.finditer(text)
    )


def main() -> None:
    try:
        raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        _respond("allow")

    chunks: list[str] = []
    _collect_strings(data, chunks)

    for chunk in chunks:
        if _has_secret(chunk):
            _respond(
                "deny",
                user_message=(
                    "Blocked: secret-like material in the edit "
                    "(key/token/password pattern)."
                ),
                agent_message=(
                    "Secret-like material detected in edit. Remove credentials; "
                    "use env/secret manager. Do not retry with the secret inline."
                ),
            )

    _respond("allow")


if __name__ == "__main__":
    main()
