import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emptyViewState } from '../../core';
import { directoryHash } from '../../test-support/directory-hash';
import { materializeFixture } from '../../test-support/fixtures';
import { LEAK_MARKER } from '../../test-support/leaky-mcp';
import { createApp } from '../app';
import { createLocalServices } from './services';
import { stateBaseDir, ViewStateStore, viewStateFile } from './view-state-store';

describe('stateBaseDir', () => {
  it('prefers SV_STATE_DIR', () => {
    expect(stateBaseDir({ SV_STATE_DIR: '/tmp/sv', XDG_STATE_HOME: '/x' }, 'linux', '/h')).toBe(
      '/tmp/sv',
    );
  });

  it('uses XDG_STATE_HOME or ~/.local/state on Linux', () => {
    expect(stateBaseDir({ XDG_STATE_HOME: '/xdg' }, 'linux', '/h')).toBe('/xdg/skills-visualizer');
    expect(stateBaseDir({}, 'linux', '/h')).toBe('/h/.local/state/skills-visualizer');
    expect(stateBaseDir({ XDG_STATE_HOME: 'relative' }, 'linux', '/h')).toBe(
      '/h/.local/state/skills-visualizer',
    );
  });

  it('uses Application Support on macOS', () => {
    expect(stateBaseDir({}, 'darwin', '/Users/u')).toBe(
      '/Users/u/Library/Application Support/skills-visualizer',
    );
  });

  it('keys the file by a hash of the real root', () => {
    const file = viewStateFile('/state', '/repo');
    expect(path.dirname(path.dirname(file))).toBe('/state');
    expect(path.basename(path.dirname(file))).toMatch(/^[0-9a-f]{64}$/);
    expect(path.basename(file)).toBe('view.json');
  });
});

describe('ViewStateStore', () => {
  let dir = '';

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'sv-state-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads missing or corrupt state as empty and round-trips writes', async () => {
    const store = new ViewStateStore(path.join(dir, 'k', 'view.json'));
    expect(await store.read()).toEqual(emptyViewState());
    const view = { schemaVersion: 1 as const, pinned: { a: { x: 1.5, y: -2 } } };
    await store.write(view);
    expect(await store.read()).toEqual(view);
    expect(await readdir(path.join(dir, 'k'))).toEqual(['view.json']);
  });

  it('serializes concurrent writes so the latest value wins', async () => {
    const store = new ViewStateStore(path.join(dir, 'queue', 'view.json'));
    const first = { schemaVersion: 1 as const, pinned: { a: { x: 1, y: 1 } } };
    const second = { schemaVersion: 1 as const, pinned: { b: { x: 2, y: 2 } } };
    await Promise.all([store.write(first), store.write(second)]);
    expect(await store.read()).toEqual(second);
  });
});

describe('local services over a real directory', () => {
  let repo = '';
  let state = '';

  beforeAll(async () => {
    repo = await materializeFixture('cursor-basic');
    state = await mkdtemp(path.join(tmpdir(), 'sv-state-'));
  });

  afterAll(async () => {
    await rm(repo, { recursive: true, force: true });
    await rm(state, { recursive: true, force: true });
  });

  it('serves every route, writes only to the state dir, and leaves the repo byte-identical', async () => {
    const before = await directoryHash(repo);
    const app = createApp(await createLocalServices(repo, { stateDir: state }));
    const headers = {
      host: '127.0.0.1:5173',
      origin: 'http://127.0.0.1:5173',
      'content-type': 'application/json',
    };
    const view = { schemaVersion: 1, pinned: { 'instruction:AGENTS.md': { x: 10, y: 20 } } };

    const responses = [
      await app.request('/api/meta', { headers }),
      await app.request('/api/graph', { headers }),
      await app.request('/api/scan', { method: 'POST', headers, body: '{}' }),
      await app.request('/api/file?path=AGENTS.md', { headers }),
      await app.request('/api/file?path=.cursor/mcp.json', { headers }),
      await app.request('/api/view-state', { method: 'PUT', headers, body: JSON.stringify(view) }),
    ];
    for (const res of responses) expect(res.status).toBe(200);
    const bodies = await Promise.all(responses.map((r) => r.text()));
    for (const body of bodies) {
      expect(body).not.toContain(LEAK_MARKER);
      expect(body).not.toContain(repo);
    }
    expect(JSON.parse(bodies[0] ?? '{}').displayName).toBe(path.basename(repo));

    const reloaded = createApp(await createLocalServices(repo, { stateDir: state }));
    expect(await (await reloaded.request('/api/view-state', { headers })).json()).toEqual(view);

    expect(await directoryHash(repo)).toBe(before);
    const [key] = await readdir(state);
    expect(await readdir(path.join(state, key ?? ''))).toEqual(['view.json']);
    expect(JSON.parse(await readFile(path.join(state, key ?? '', 'view.json'), 'utf8'))).toEqual(
      view,
    );
  });
});
