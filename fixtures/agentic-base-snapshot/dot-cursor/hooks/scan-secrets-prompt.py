#!/usr/bin/env python3
"""beforeSubmitPrompt: block prompts that look like they contain secrets."""

from __future__ import annotations

import json
import re
import sys

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


def _has_secret(text: str) -> bool:
    for pat in SECRET_PATTERNS:
        if pat.search(text):
            return True
    return any(
        m.group(1).lower() not in LOCAL_HOSTS for m in URL_CREDENTIALS.finditer(text)
    )


def _respond(continue_: bool, user_message: str | None = None) -> None:
    out: dict = {"continue": continue_}
    if user_message:
        out["user_message"] = user_message
    print(json.dumps(out))
    sys.exit(0)


def main() -> None:
    try:
        raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        _respond(True)

    prompt = data.get("prompt") or ""
    if not isinstance(prompt, str):
        prompt = str(prompt)

    if _has_secret(prompt):
        _respond(
            False,
            user_message="Possible secret in prompt — remove before sending.",
        )

    _respond(True)


if __name__ == "__main__":
    main()
