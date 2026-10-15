import { mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type AgentGraph, type RepoPath, sha256Hex, WritableMemoryFileSource } from '../core';
import { scan } from '../scanner';
import { materializeFixture, readFixtureFiles } from '../test-support/fixtures';
import { LEAK_MARKER, leakyMcpJson } from '../test-support/leaky-mcp';
import { createApp, type Services } from './app';
import { LocalFileSource } from './node/local-file-source';
import { createLocalServices } from './node/services';

const ORIGIN = 'http://127.0.0.1:5173';
const HOST = '127.0.0.1:5173';
const SKILL = '.cursor/skills/code-review/SKILL.md';

function send(
  app: ReturnType<typeof createApp>,
  route: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request(route, {
    method: 'POST',
    headers: { host: HOST, origin: ORIGIN, 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function readText(source: WritableMemoryFileSource, path: string): Promise<string> {
  const bytes = await source.read(path as RepoPath);
  expect(bytes).not.toBeNull();
  return new TextDecoder().decode(bytes ?? new Uint8Array());
}

async function contentHashes(dir: string): Promise<Map<string, string>> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const map = new Map<string, string>();
  for (const e of entries) {
    if (!e.isFile()) continue;
    const abs = path.join(e.parentPath, e.name);
    map.set(path.relative(dir, abs), await sha256Hex(new Uint8Array(await readFile(abs))));
  }
  return map;
}

function writableServices(files: Map<string, Uint8Array | string>) {
  const source = new WritableMemoryFileSource(files, { id: 'memory:edit' });
  const services: Services = {
    meta: async () => ({
      displayName: 'repo',
      capabilities: source.capabilities,
      schemaVersion: 1,
    }),
    graph: async () => scan(source),
    file: async () => null,
    getView: async () => ({ schemaVersion: 1, pinned: {} }),
    putView: async () => {},
    source: () => source,
    invalidateGraph: () => {},
  };
  return { services, source };
}

describe('edit routes', () => {
  let app: ReturnType<typeof createApp>;
  let source: WritableMemoryFileSource;
  let originalText: string;
  let originalHash: string;

  beforeEach(async () => {
    const files = new Map<string, Uint8Array | string>(readFixtureFiles('cursor-basic'));
    files.set('.cursor/mcp.json', leakyMcpJson());
    files.set('.env', `TOKEN=${LEAK_MARKER}-dotenv`);
    const fake = writableServices(files);
    app = createApp(fake.services);
    source = fake.source;
    originalText = await readText(source, SKILL);
    originalHash = await sha256Hex(new TextEncoder().encode(originalText));
  });

  it('previews and applies a description + link edit, then rescans', async () => {
    const newText = originalText
      .replace(
        'Review a diff for correctness, readability, and test coverage. Use before opening a pull request.',
        'Review a diff carefully. Use before opening a pull request.',
      )
      .replace(
        '3. Run [the lint script](scripts/run-lint.sh) and fix findings.\n',
        '3. Run [the lint script](scripts/run-lint.sh) and fix findings.\n4. See also [testing notes](../../../docs/testing.md).\n',
      );

    const preview = await send(app, '/api/edits/preview', {
      path: SKILL,
      expectedHash: originalHash,
      newText,
    });
    expect(preview.status).toBe(200);
    const previewBody = (await preview.json()) as {
      diff: string;
      blocking: boolean;
      impact: { edgesAdded: string[]; edgesRemoved: string[] };
    };
    expect(previewBody.blocking).toBe(false);
    expect(previewBody.diff).toContain('Review a diff carefully');
    expect(previewBody.impact.edgesAdded.length).toBeGreaterThan(0);

    const apply = await send(app, '/api/edits/apply', {
      path: SKILL,
      expectedHash: originalHash,
      newText,
    });
    expect(apply.status).toBe(200);
    const applied = (await apply.json()) as { hash: string; graph: AgentGraph };
    expect(applied.graph.source.id).toBe('memory:edit');
    expect(JSON.stringify(applied)).not.toContain('/home/');
    const skill = applied.graph.nodes.find((n) => n.id === 'skill:.cursor/skills/code-review');
    expect(skill?.attributes.description).toContain('carefully');
    expect(
      applied.graph.edges.some(
        (e) =>
          e.source === 'skill:.cursor/skills/code-review' && e.target === 'file:docs/testing.md',
      ),
    ).toBe(true);
    expect(await readText(source, SKILL)).toBe(newText);
    expect(await sha256Hex(new TextEncoder().encode(newText))).toBe(applied.hash);
  });

  it('returns 409 and leaves the file untouched when the hash is stale', async () => {
    const conflict = await send(app, '/api/edits/apply', {
      path: SKILL,
      expectedHash: 'a'.repeat(64),
      newText: originalText.replace('Review a diff', 'CHANGED'),
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: 'conflict', currentHash: originalHash });
    expect(await readText(source, SKILL)).toBe(originalText);
  });

  it.each([
    ['../outside.md', 400],
    ['/etc/passwd', 400],
    ['%2e%2e/outside.md', 400],
    ['.cursor/mcp.json', 403],
    ['.env', 403],
    ['docs/conventions.md', 403],
    ['AGENTS.md', 403],
  ])('rejects edit path %s with %i and never writes', async (pathArg, status) => {
    const hashes = new Map<string, string>();
    for (const p of await source.list()) {
      const b = await source.read(p);
      if (b) hashes.set(p, await sha256Hex(b));
    }
    const res = await send(app, '/api/edits/apply', {
      path: pathArg,
      expectedHash: originalHash,
      newText: 'x',
    });
    expect(res.status).toBe(status);
    for (const p of await source.list()) {
      const b = await source.read(p);
      expect(b).not.toBeNull();
      if (b) expect(await sha256Hex(b)).toBe(hashes.get(p));
    }
  });

  it('blocks apply when YAML frontmatter is malformed', async () => {
    const res = await send(app, '/api/edits/apply', {
      path: SKILL,
      expectedHash: originalHash,
      newText: '---\nname: [broken\ndescription: x\n---\n',
    });
    expect(res.status).toBe(400);
    expect(await readText(source, SKILL)).toBe(originalText);
  });

  it('never returns a sentinel from edit routes', async () => {
    const bodies = [
      await send(app, '/api/edits/preview', {
        path: SKILL,
        expectedHash: originalHash,
        newText: originalText,
      }),
      await send(app, '/api/edits/apply', {
        path: '.cursor/mcp.json',
        expectedHash: originalHash,
        newText: leakyMcpJson(),
      }),
      await send(app, '/api/edits/apply', {
        path: '.env',
        expectedHash: originalHash,
        newText: `TOKEN=${LEAK_MARKER}`,
      }),
    ];
    for (const res of bodies) expect(await res.text()).not.toContain(LEAK_MARKER);
  });

  it.each([
    ['cross-site Origin', { origin: 'http://evil.example.com' }, 403],
    ['wrong content type', { 'content-type': 'text/plain' }, 415],
  ])('guards edit routes against %s', async (_name, headers, status) => {
    for (const route of ['/api/edits/preview', '/api/edits/apply']) {
      expect(
        (
          await send(
            app,
            route,
            { path: SKILL, expectedHash: originalHash, newText: originalText },
            headers,
          )
        ).status,
      ).toBe(status);
    }
  });
});

describe('edit apply on a real local tree', () => {
  let dir = '';
  let outside = '';

  beforeAll(async () => {
    dir = await materializeFixture('cursor-basic');
    outside = await mkdtemp(path.join(tmpdir(), 'sv-edit-out-'));
    await writeFile(path.join(outside, 'secret.md'), 'nope');
    await symlink(path.join(outside, 'secret.md'), path.join(dir, 'escape-link.md'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('touches only the target skill file and refuses escape symlinks', async () => {
    const source = await LocalFileSource.open(dir);
    const stateDir = await mkdtemp(path.join(tmpdir(), 'sv-edit-state-'));
    const app = createApp(await createLocalServices(dir, { stateDir }));
    const skillPath = path.join(dir, '.cursor', 'skills', 'code-review', 'SKILL.md');
    const beforeText = await readFile(skillPath, 'utf8');
    const hash = await sha256Hex(new TextEncoder().encode(beforeText));
    const snapBefore = await contentHashes(dir);

    const newText = beforeText.replace('Review a diff', 'Review the diff');
    const res = await send(app, '/api/edits/apply', {
      path: SKILL,
      expectedHash: hash,
      newText,
    });
    expect(res.status).toBe(200);
    expect(await readFile(skillPath, 'utf8')).toBe(newText);

    const snapAfter = await contentHashes(dir);
    const changed = [...snapAfter.keys()].filter((k) => snapAfter.get(k) !== snapBefore.get(k));
    expect(changed).toEqual([SKILL]);

    expect(
      await source.replaceIfUnchanged(
        'escape-link.md' as RepoPath,
        hash,
        new TextEncoder().encode('x'),
      ),
    ).toEqual({ ok: false, reason: 'missing' });

    await rm(stateDir, { recursive: true, force: true });
  });
});
