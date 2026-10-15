import { describe, expect, it } from 'vitest';
import { emptyViewState, WritableMemoryFileSource } from '../core';
import { scan } from '../scanner';
import { readFixtureFiles } from '../test-support/fixtures';
import { createApp, type Services } from './app';
import {
  AUTH_COOKIE,
  bearerToken,
  createAuthToken,
  requestHasValidToken,
  tokenEquals,
} from './auth';

const HOST = '127.0.0.1:5173';
const ORIGIN = 'http://127.0.0.1:5173';
const SKILL = '.cursor/skills/code-review/SKILL.md';

function services(): Services {
  const source = new WritableMemoryFileSource(readFixtureFiles('cursor-basic'), {
    id: 'memory:auth',
  });
  return {
    meta: async () => ({
      displayName: 'repo',
      capabilities: source.capabilities,
      schemaVersion: 1,
    }),
    graph: async () => scan(source),
    file: async () => null,
    getView: async () => emptyViewState(),
    putView: async () => {},
    source: () => source,
    invalidateGraph: () => {},
  };
}

describe('tokenEquals / bearer', () => {
  it('compares equal-length tokens in constant fashion and rejects length mismatch', () => {
    const t = createAuthToken();
    expect(tokenEquals(t, t)).toBe(true);
    expect(tokenEquals(t, `${t.slice(0, -1)}x`)).toBe(false);
    expect(tokenEquals(t, t.slice(0, -1))).toBe(false);
  });

  it('parses Bearer headers', () => {
    expect(bearerToken('Bearer abc')).toBe('abc');
    expect(bearerToken('bearer abc')).toBe('abc');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });

  it('accepts cookie or bearer', () => {
    const t = createAuthToken();
    expect(requestHasValidToken(t, undefined, t)).toBe(true);
    expect(requestHasValidToken(undefined, `Bearer ${t}`, t)).toBe(true);
    expect(requestHasValidToken('wrong', `Bearer ${t}`, t)).toBe(true);
    expect(requestHasValidToken('wrong', 'Bearer wrong', t)).toBe(false);
  });
});

describe('createApp auth', () => {
  const token = 'test-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  it('returns 401 on /api/graph without a token and never echoes secrets', async () => {
    const app = createApp(services(), { auth: { token } });
    const res = await app.request('/api/graph', { headers: { host: HOST } });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(JSON.stringify(body)).not.toContain(token);
  });

  it('returns 401 on /api/edits/apply with a wrong token', async () => {
    const app = createApp(services(), { auth: { token } });
    const res = await app.request('/api/edits/apply', {
      method: 'POST',
      headers: {
        host: HOST,
        origin: ORIGIN,
        'content-type': 'application/json',
        authorization: 'Bearer wrong-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
      body: JSON.stringify({
        path: SKILL,
        expectedHash: 'a'.repeat(64),
        newText: 'x',
      }),
    });
    expect(res.status).toBe(401);
    expect(JSON.stringify(await res.json())).not.toContain(token);
  });

  it('allows /api/graph with a correct Bearer token', async () => {
    const app = createApp(services(), { auth: { token } });
    const res = await app.request('/api/graph', {
      headers: { host: HOST, authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).not.toContain(token);
  });

  it('allows /api/graph with the auth cookie', async () => {
    const app = createApp(services(), { auth: { token } });
    const res = await app.request('/api/graph', {
      headers: { host: HOST, cookie: `${AUTH_COOKIE}=${token}` },
    });
    expect(res.status).toBe(200);
  });

  it('exchanges ?token= for an HttpOnly SameSite=Strict cookie and redirects', async () => {
    const app = createApp(services(), { auth: { token } });
    const res = await app.request(`/?token=${encodeURIComponent(token)}`, {
      headers: { host: HOST },
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${AUTH_COOKIE}=${token}`);
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie.toLowerCase()).toMatch(/samesite=strict/);
    expect(setCookie.toLowerCase()).toContain('path=/');
    const body = await res.text();
    // Redirect bodies must not be the only place the token appears — cookie is intentional.
    expect(body).not.toContain(token);
  });

  it('rejects a wrong exchange token with 401 and no cookie', async () => {
    const app = createApp(services(), { auth: { token } });
    const res = await app.request('/?token=wrong', {
      headers: { host: HOST },
      redirect: 'manual',
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(JSON.stringify(await res.json())).not.toContain(token);
  });
});
