# Bugbot (optional)

Optional complement to the in-repo `reviewer` / `security` / `verifier` crew on ship / merge-ready. Prefer the custom agents first; run Bugbot when available for a second pass.

## Focus

- Match approved plan / acceptance criteria (no drive-by scope)
- Missing tests for behavior changes
- Secrets / credentials in the diff
- OWASP-ish authz and injection risks

Keep findings actionable; do not replace the ship gate.

For local incident/debug or missing coverage before a Bugbot pass, prefer skills `debug-incident` / `add-test` (lean loop + builder) first.
