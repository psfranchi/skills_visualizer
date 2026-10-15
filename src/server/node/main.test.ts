import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../test-support/fixtures';
import { type RunningServer, startStaticServer } from './main';

describe('startStaticServer', () => {
  let repo = '';
  let scratch = '';
  let server: RunningServer;

  beforeAll(async () => {
    repo = await materializeFixture('cursor-basic');
    scratch = await mkdtemp(path.join(tmpdir(), 'sv-serve-'));
    await writeFile(path.join(scratch, 'index.html'), '<!doctype html><title>sv</title>');
    server = await startStaticServer({
      root: repo,
      port: 0,
      stateDir: path.join(scratch, 'state'),
      webDir: scratch,
    });
  });

  afterAll(async () => {
    await server?.close();
    await rm(repo, { recursive: true, force: true });
    await rm(scratch, { recursive: true, force: true });
  });

  it('binds to loopback and serves the UI and the API', async () => {
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const page = await fetch(server.url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<title>sv</title>');
    expect((await fetch(new URL('api/meta', server.url))).status).toBe(401);
    const meta = await fetch(new URL('api/meta', server.url), {
      headers: { authorization: `Bearer ${server.token}` },
    });
    expect(meta.status).toBe(200);
    const body = await meta.json();
    expect(body).toMatchObject({ displayName: path.basename(repo) });
    expect(JSON.stringify(body)).not.toContain(server.token);
  });

  it('forbids framing the UI', async () => {
    const page = await fetch(server.url);
    expect(page.headers.get('x-frame-options')).toBe('DENY');
    expect(page.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
  });
});
