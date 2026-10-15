import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

export const AUTH_COOKIE = 'sv_token';

export function createAuthToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  // base64url without padding
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Constant-time compare for equal-length strings; false when lengths differ. */
export function tokenEquals(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export function requestHasValidToken(
  cookieValue: string | undefined,
  authorization: string | undefined,
  expected: string,
): boolean {
  const bearer = bearerToken(authorization);
  if (bearer !== null && tokenEquals(bearer, expected)) return true;
  if (cookieValue !== undefined && tokenEquals(cookieValue, expected)) return true;
  return false;
}

/** Requires cookie `sv_token` or `Authorization: Bearer` matching the process token. */
export function requireAuth(token: string): MiddlewareHandler {
  return async (c, next) => {
    if (requestHasValidToken(getCookie(c, AUTH_COOKIE), c.req.header('authorization'), token)) {
      await next();
      return;
    }
    return c.json({ error: 'Unauthorized' }, 401);
  };
}

/**
 * `GET /?token=<t>`: constant-time check, set HttpOnly SameSite=Strict cookie, redirect to `/`.
 * Missing or wrong token → 401 JSON (never echoes the token).
 */
export function handleTokenExchange(c: Context, token: string): Response {
  const provided = c.req.query('token');
  if (provided === undefined || !tokenEquals(provided, token)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  setCookie(c, AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Strict',
    path: '/',
    secure: false,
  });
  return c.redirect('/');
}

/** True when the request URL is a token-exchange attempt on `/`. */
export function isTokenExchangePath(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url, 'http://127.0.0.1');
    return parsed.pathname === '/' && parsed.searchParams.has('token');
  } catch {
    return false;
  }
}
