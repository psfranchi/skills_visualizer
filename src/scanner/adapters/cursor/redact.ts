export const REDACTED = '[redacted]';

const ENV_REFERENCE = /^\$\{env:[A-Za-z_][A-Za-z0-9_]*\}$/;
const SECRET_NAME =
  /(token|secret|passw(or)?d|pwd|api[-_]?key|key|auth|credential|bearer|cookie|session)/i;
const HEADER_FLAG = /^(?:--headers?|-H)$/;
/** Short flags whose attached value is a secret (`mysql -pSECRET`). */
const SECRET_SHORT_FLAG = /^-p./s;
const AUTH_MARKER = /authorization\s*:|bearer\s|basic\s/i;
const TOKEN_PREFIX = /^(?:ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|glpat-|xox[abpr]-|sk-|AKIA|eyJ)/;
const INLINE_SECRET =
  /((?:^|[\s;&,])(?:password|pwd|passwd|token|secret|api[-_]?key)\s*=\s*)[^\s;&,]+/gi;
const OPAQUE_CHARS = /^[A-Za-z0-9_\-+/=]{24,}$/;
const CREDENTIAL_SEGMENT = /^[A-Za-z0-9_-]{20,}$/;

export function isEnvReference(value: unknown): value is string {
  return typeof value === 'string' && ENV_REFERENCE.test(value);
}

/** `env` / `headers` / `auth`: keys only; a value survives only if it is a pure `${env:NAME}` reference. */
export function redactMap(value: unknown): Record<string, string> | string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return REDACTED;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => {
        const entry = (value as Record<string, unknown>)[key];
        return [key, isEnvReference(entry) ? entry : REDACTED];
      }),
  );
}

/** Long path segments mixing letters and digits (`/mcp/<api key>/sse`) look like credentials. */
function isCredentialSegment(segment: string): boolean {
  return CREDENTIAL_SEGMENT.test(segment) && /[A-Za-z]/.test(segment) && /\d/.test(segment);
}

function maskPathSegments(path: string): string {
  return path
    .split('/')
    .map((segment) => (isCredentialSegment(segment) ? REDACTED : segment))
    .join('/');
}

/** Drops userinfo, query string, fragment, and credential-looking path segments. Unparseable URLs are fully redacted. */
export function sanitizeUrl(value: unknown): string {
  if (isEnvReference(value)) return value;
  if (typeof value !== 'string') return REDACTED;
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    url.pathname = maskPathSegments(url.pathname);
    return url.toString();
  } catch {
    return REDACTED;
  }
}

function looksLikeUrl(value: string): boolean {
  return /^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(value);
}

/** Tail of an embedded URL (after `://`, no whitespace) without userinfo, query, fragment, or credential segments. */
function sanitizeUrlTail(tail: string): string {
  const cut = tail.search(/[?#]/);
  const withoutQuery = cut === -1 ? tail : tail.slice(0, cut);
  const slash = withoutQuery.indexOf('/');
  const authority = slash === -1 ? withoutQuery : withoutQuery.slice(0, slash);
  const path = slash === -1 ? '' : withoutQuery.slice(slash);
  return authority.slice(authority.lastIndexOf('@') + 1) + maskPathSegments(path);
}

/** Sanitizes every `scheme://…` occurrence inside a longer string. Linear scan (no backtracking regex). */
function sanitizeEmbeddedUrls(text: string): string {
  let out = '';
  let from = 0;
  for (let at = text.indexOf('://'); at !== -1; at = text.indexOf('://', from)) {
    const start = at + 3;
    let end = start;
    while (end < text.length && !/\s/.test(text.charAt(end))) end++;
    out += text.slice(from, start) + sanitizeUrlTail(text.slice(start, end));
    from = end;
  }
  return out + text.slice(from);
}

/** Long opaque tokens mixing lower, upper, and digits; paths (`/…`, `./…`) are left alone. */
function looksLikeOpaqueToken(value: string): boolean {
  return (
    OPAQUE_CHARS.test(value) &&
    !value.startsWith('/') &&
    !value.startsWith('.') &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value)
  );
}

/** A positional arg or the value part of `--flag=value` / `NAME=value`. */
function maskValue(value: string): string {
  if (ENV_REFERENCE.test(value)) return value;
  if (AUTH_MARKER.test(value) || TOKEN_PREFIX.test(value) || looksLikeOpaqueToken(value)) {
    return REDACTED;
  }
  if (looksLikeUrl(value)) return sanitizeUrl(value);
  return sanitizeEmbeddedUrls(value.replace(INLINE_SECRET, `$1${REDACTED}`));
}

/** `Name: value` → `Name: [redacted]` unless the value is a pure `${env:NAME}` reference. */
function maskHeader(value: string): string {
  const colon = value.indexOf(':');
  if (colon === -1) return isEnvReference(value) ? value : REDACTED;
  if (isEnvReference(value.slice(colon + 1).trim())) return value;
  return `${value.slice(0, colon)}: ${REDACTED}`;
}

type Pending = 'secret' | 'header' | null;

function maskArg(arg: string): { text: string; next: Pending } {
  const flag = /^(--?[\w-]+)(?:=(.*))?$/.exec(arg);
  const name = flag?.[1];
  const inline = flag?.[2];
  if (name !== undefined && HEADER_FLAG.test(name)) {
    return inline === undefined
      ? { text: arg, next: 'header' }
      : { text: `${name}=${maskHeader(inline)}`, next: null };
  }
  if (AUTH_MARKER.test(arg)) return { text: REDACTED, next: null };
  const secretName = name !== undefined && SECRET_NAME.test(name);
  if (SECRET_SHORT_FLAG.test(arg)) {
    // `-pX` cannot be told apart from a single-dash long flag (`-password X`): mask both forms.
    const maskNext = secretName && inline === undefined;
    return { text: `${arg.slice(0, 2)}${REDACTED}`, next: maskNext ? 'secret' : null };
  }
  if (name !== undefined && secretName) {
    if (inline === undefined) return { text: arg, next: 'secret' };
    return { text: isEnvReference(inline) ? arg : `${name}=${REDACTED}`, next: null };
  }
  if (name !== undefined && inline !== undefined) {
    return { text: `${name}=${maskValue(inline)}`, next: null };
  }
  const pair = /^([A-Za-z_][\w-]*)=(.*)$/.exec(arg);
  if (pair?.[1] !== undefined && pair[2] !== undefined) {
    if (SECRET_NAME.test(pair[1])) {
      return { text: isEnvReference(pair[2]) ? arg : `${pair[1]}=${REDACTED}`, next: null };
    }
    return { text: `${pair[1]}=${maskValue(pair[2])}`, next: null };
  }
  return { text: name !== undefined ? arg : maskValue(arg), next: null };
}

/**
 * Masks values after secret-looking flags (`--token X`) and header flags (`-H 'Authorization: …'`),
 * inline values (`--token=X`, `-pX`), secret-looking `NAME=value` pairs, `key=value` secrets
 * anywhere in an arg, known token prefixes, long opaque tokens, and credentials inside URLs
 * (including URLs embedded in `NAME=` / `--flag=` values or longer strings).
 */
export function maskArgs(value: unknown): string[] | string {
  if (!Array.isArray(value)) return REDACTED;
  const masked: string[] = [];
  let pending: Pending = null;
  for (const arg of value) {
    if (typeof arg !== 'string') {
      masked.push(REDACTED);
      pending = null;
      continue;
    }
    if (pending === 'header') {
      masked.push(maskHeader(arg));
      pending = null;
      continue;
    }
    if (pending === 'secret') {
      masked.push(isEnvReference(arg) ? arg : REDACTED);
      pending = null;
      continue;
    }
    const result = maskArg(arg);
    masked.push(result.text);
    pending = result.next;
  }
  return masked;
}

/** A `command` string such as `docker run -e API_TOKEN=X img`: tokens masked like args, re-joined with spaces. */
export function maskCommand(value: unknown): string {
  if (typeof value !== 'string') return REDACTED;
  const tokens = value.trim().split(/\s+/);
  const masked = maskArgs(tokens);
  return Array.isArray(masked) ? masked.join(' ') : REDACTED;
}
