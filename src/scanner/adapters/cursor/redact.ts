export const REDACTED = '[redacted]';

const ENV_REFERENCE = /^\$\{env:[A-Za-z_][A-Za-z0-9_]*\}$/;
/** Fail-closed: `pass` also matches `--bypass…`, `key` also matches `--keyboard`. */
const SECRET_NAME =
  /(token|secret|pass|pwd|api[-_]?key|key|auth|credential|bearer|cookie|session|signature|(?:^|[^a-z])sig(?:[^a-z]|$))/i;
const HEADER_FLAG = /^(?:--headers?|-H)$/;
/** Short flags whose attached value is a secret (`mysql -pSECRET`). */
const SECRET_SHORT_FLAG = /^-p./s;
const AUTH_MARKER = /authorization\s*:|bearer\s|basic\s/i;
/** A standalone auth scheme word; the next token is its credential. */
const AUTH_SCHEME = /^(?:bearer|basic)$/i;
const MAX_COMMAND_DEPTH = 2;
const TOKEN_PREFIX = /^(?:ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|glpat-|xox[abpr]-|sk-|AKIA|eyJ)/;
const INLINE_SEPARATOR = /[\s;&,]/;
/** `user:pass@host…` without a scheme (Go / MySQL DSNs such as `app:pw@tcp(db:3306)/app`). */
const SCHEMELESS_USERINFO = /^[^\s:@/]+:[^\s@/]*@/;
const HEX_TOKEN = /^[0-9a-f]{32,}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

/**
 * `key=value` pairs separated by whitespace, `;`, `&`, or `,` (libpq, ADO.NET, Azure connection
 * strings): the value is masked when the key looks secret. Linear scan; the key ends at the first `=`.
 */
function maskInlineSecrets(text: string): string {
  let out = '';
  let segment = '';
  const flush = () => {
    const eq = segment.indexOf('=');
    const key = eq === -1 ? '' : segment.slice(0, eq);
    const value = eq === -1 ? '' : segment.slice(eq + 1).trim();
    const secret = key !== '' && value !== '' && SECRET_NAME.test(key) && !isEnvReference(value);
    out += secret ? `${key}=${REDACTED}` : segment;
    segment = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (!INLINE_SEPARATOR.test(ch)) {
      segment += ch;
      continue;
    }
    if (/\s/.test(ch)) {
      let end = i;
      while (end < text.length && /\s/.test(text.charAt(end))) end++;
      const run = text.slice(i, end);
      i = end - 1;
      // `password = X`: whitespace around `=` stays inside the pair.
      if (segment !== '' && (segment.endsWith('=') || text.charAt(end) === '=')) {
        segment += run;
        continue;
      }
      flush();
      out += run;
      continue;
    }
    flush();
    out += ch;
  }
  flush();
  return out;
}

/** Long opaque tokens mixing lower, upper, and digits; paths (`/…`, `./…`) are left alone. */
function looksLikeOpaqueToken(value: string): boolean {
  if (HEX_TOKEN.test(value) || UUID.test(value)) return true;
  return (
    OPAQUE_CHARS.test(value) &&
    !value.startsWith('/') &&
    !value.startsWith('.') &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value)
  );
}

function stripQuotes(value: string): string {
  const first = value.charAt(0);
  return value.length >= 2 && (first === '"' || first === "'") && value.endsWith(first)
    ? value.slice(1, -1)
    : value;
}

/** A positional arg or the value part of `--flag=value` / `NAME=value`. */
function maskValue(value: string, depth: number): string {
  if (ENV_REFERENCE.test(value)) return value;
  const unquoted = stripQuotes(value);
  if (AUTH_MARKER.test(unquoted) || TOKEN_PREFIX.test(unquoted) || looksLikeOpaqueToken(unquoted)) {
    return REDACTED;
  }
  if (/\s/.test(value)) {
    // Inline pairs first: `password = X` would otherwise split into separate tokens.
    return depth < MAX_COMMAND_DEPTH
      ? maskCommandText(maskInlineSecrets(value), depth + 1)
      : REDACTED;
  }
  if (looksLikeUrl(value)) return sanitizeUrl(value);
  const withoutUserinfo = value.replace(SCHEMELESS_USERINFO, `${REDACTED}@`);
  return sanitizeEmbeddedUrls(maskInlineSecrets(withoutUserinfo));
}

/** `Name: value` → `Name: [redacted]` unless the value is a pure `${env:NAME}` reference. */
function maskHeader(value: string): string {
  const colon = value.indexOf(':');
  if (colon === -1) return isEnvReference(value) ? value : REDACTED;
  if (isEnvReference(value.slice(colon + 1).trim())) return value;
  return `${value.slice(0, colon)}: ${REDACTED}`;
}

type Pending = 'secret' | 'header' | null;

function maskArg(arg: string, depth: number): { text: string; next: Pending } {
  const flag = /^(--?[\w-]+)(?:=(.*))?$/s.exec(arg);
  const name = flag?.[1];
  const inline = flag?.[2];
  if (name !== undefined && HEADER_FLAG.test(name)) {
    return inline === undefined
      ? { text: arg, next: 'header' }
      : { text: `${name}=${maskHeader(inline)}`, next: null };
  }
  if (AUTH_SCHEME.test(arg)) return { text: arg, next: 'secret' };
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
    return { text: `${name}=${maskValue(inline, depth)}`, next: null };
  }
  const pair = /^([A-Za-z_][\w-]*)=(.*)$/s.exec(arg);
  if (pair?.[1] !== undefined && pair[2] !== undefined) {
    if (SECRET_NAME.test(pair[1])) {
      return { text: isEnvReference(pair[2]) ? arg : `${pair[1]}=${REDACTED}`, next: null };
    }
    return { text: `${pair[1]}=${maskValue(pair[2], depth)}`, next: null };
  }
  return { text: name !== undefined ? arg : maskValue(arg, depth), next: null };
}

/**
 * Masks values after secret-looking flags (`--token X`) and header flags (`-H 'Authorization: …'`),
 * inline values (`--token=X`, `-pX`), secret-looking `NAME=value` pairs, `key=value` secrets
 * anywhere in an arg, known token prefixes, long opaque tokens, and credentials inside URLs
 * (including URLs embedded in `NAME=` / `--flag=` values or longer strings).
 */
export function maskArgs(value: unknown): string[] | string {
  return Array.isArray(value) ? maskTokens(value, 0) : REDACTED;
}

function maskTokens(value: readonly unknown[], depth: number): string[] {
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
      // `--auth Basic X`: the scheme word is not the secret; the token after it is.
      if (AUTH_SCHEME.test(arg)) {
        masked.push(arg);
        continue;
      }
      masked.push(isEnvReference(arg) ? arg : REDACTED);
      pending = null;
      continue;
    }
    const result = maskArg(arg, depth);
    masked.push(result.text);
    pending = result.next;
  }
  return masked;
}

interface ShellToken {
  value: string;
  /** First quote character used in the token, re-applied for display. */
  quote: string;
}

/**
 * Splits on unquoted whitespace with POSIX-like quoting: quotes group words and are removed,
 * a backslash escapes the next character outside single quotes. An unterminated quote runs to
 * the end of the text, so its content stays one token (and is masked as a whole).
 */
function shellTokens(text: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  let current: ShellToken | null = null;
  let open: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (open === null && /\s/.test(ch)) {
      if (current) tokens.push(current);
      current = null;
      continue;
    }
    current ??= { value: '', quote: '' };
    if (ch === '\\' && open !== "'" && i + 1 < text.length) {
      current.value += text.charAt(++i);
    } else if (open !== null) {
      if (ch === open) open = null;
      else current.value += ch;
    } else if (ch === '"' || ch === "'") {
      open = ch;
      current.quote ||= ch;
    } else {
      current.value += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function maskCommandText(text: string, depth: number): string {
  const tokens = shellTokens(text);
  const masked = maskTokens(
    tokens.map((t) => t.value),
    depth,
  );
  return masked.map((m, i) => `${tokens[i]?.quote ?? ''}${m}${tokens[i]?.quote ?? ''}`).join(' ');
}

/**
 * A `command` string such as `docker run -e API_TOKEN=X img`: split shell-style (quoted header
 * values stay one token), masked like args, re-joined with spaces. Nested command strings
 * (`sh -c "…"`) are masked recursively up to a small depth, then redacted whole.
 */
export function maskCommand(value: unknown): string {
  return typeof value === 'string' ? maskCommandText(value, 0) : REDACTED;
}
