import { beforeEach, describe, expect, it } from 'vitest';
import {
  type AgentGraph,
  decodeUtf8Strict,
  emptyViewState,
  type GraphViewState,
  sha256Hex,
  WritableMemoryFileSource,
} from '../core';
import { scan } from '../scanner';
import { readFixtureFiles } from '../test-support/fixtures';
import { LEAK_MARKER, leakyMcpJson } from '../test-support/leaky-mcp';
import {
  createApp,
  type FileResponse,
  hostnameOf,
  isSecretBearingPath,
  type RawFile,
  type Services,
} from './app';

const ORIGIN = 'http://127.0.0.1:5173';
const HOST = '127.0.0.1:5173';

/** Fake services over an in-memory writable repo; records view-state writes. */
function fakeServices(files: Map<string, Uint8Array | string>, sourceId: string) {
  const source = new WritableMemoryFileSource(files, { id: sourceId });
  let view: GraphViewState = emptyViewState();
  const calls = { rescans: 0, puts: 0, reads: [] as string[], invalidations: 0 };
  const services: Services = {
    meta: async () => ({
      displayName: 'repo',
      capabilities: source.capabilities,
      schemaVersion: 1,
    }),
    graph: async (opts) => {
      if (opts?.rescan) calls.rescans++;
      return scan(source);
    },
    file: async (path): Promise<RawFile | null> => {
      calls.reads.push(path);
      const bytes = await source.read(path);
      const decoded = bytes ? decodeUtf8Strict(bytes) : null;
      return bytes && decoded?.ok ? { text: decoded.text, hash: await sha256Hex(bytes) } : null;
    },
    getView: async () => view,
    putView: async (next) => {
      calls.puts++;
      view = next;
    },
    source: () => source,
    invalidateGraph: () => {
      calls.invalidations++;
    },
  };
  return { services, calls, source };
}

function repoFiles(): Map<string, Uint8Array | string> {
  const files = new Map<string, Uint8Array | string>(readFixtureFiles('cursor-basic'));
  files.set('.cursor/mcp.json', leakyMcpJson());
  files.set('.env', `TOKEN=${LEAK_MARKER}-dotenv`);
  const agents = new TextDecoder().decode(files.get('AGENTS.md') as Uint8Array);
  files.set('.mcp.json', leakyMcpJson());
  files.set('.claude/settings.local.json', `{"env":{"TOKEN":"${LEAK_MARKER}-claude"}}`);
  files.set('docs/id_conventions.md', '# ID conventions\n');
  files.set('docs/inferred-only.md', `token: ${LEAK_MARKER}-inferred\n`);
  files.set(
    'AGENTS.md',
    [
      agents,
      'See [env](.env) and [mcp](.cursor/mcp.json) and [root mcp](.mcp.json).',
      'Also [claude](.claude/settings.local.json) and [ids](docs/id_conventions.md).',
      'Maybe `docs/inferred-only.md` too.',
      '',
    ].join('\n'),
  );
  files.set('docs/unlinked.md', 'not referenced');
  return files;
}

function get(
  app: ReturnType<typeof createApp>,
  path: string,
  headers: Record<string, string> = {},
) {
  return app.request(path, { headers: { host: HOST, ...headers } });
}

function send(
  app: ReturnType<typeof createApp>,
  method: 'POST' | 'PUT',
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request(path, {
    method,
    headers: { host: HOST, origin: ORIGIN, 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('API routes', () => {
  let app: ReturnType<typeof createApp>;
  let calls: ReturnType<typeof fakeServices>['calls'];

  beforeEach(() => {
    const fake = fakeServices(repoFiles(), 'local:/home/someone/secret-projects/repo');
    app = createApp(fake.services);
    calls = fake.calls;
  });

  it('GET /api/meta returns a display name, not a path', async () => {
    const res = await get(app, '/api/meta');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      displayName: 'repo',
      capabilities: { write: true, watch: false },
      schemaVersion: 1,
    });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('GET /api/graph hides the absolute path in source.id', async () => {
    const res = await get(app, '/api/graph');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text).source.id).toBe('local:repo');
    expect(text).not.toContain('/home/someone');
  });

  it('POST /api/scan rescans and returns the graph', async () => {
    const res = await send(app, 'POST', '/api/scan', {});
    expect(res.status).toBe(200);
    expect(calls.rescans).toBe(1);
    expect(((await res.json()) as AgentGraph).schemaVersion).toBe(1);
  });

  it('GET /api/file serves graph-known files with their hash', async () => {
    const res = await get(app, '/api/file?path=.cursor/skills/code-review/SKILL.md');
    expect(res.status).toBe(200);
    const body = (await res.json()) as FileResponse;
    expect(body).toMatchObject({ path: '.cursor/skills/code-review/SKILL.md', redacted: false });
    expect(body.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.text).toContain('code-review');
  });

  it('GET /api/file returns redacted text for mcp.json', async () => {
    const res = await get(app, '/api/file?path=.cursor/mcp.json');
    expect(res.status).toBe(200);
    const body = (await res.json()) as FileResponse;
    expect(body.redacted).toBe(true);
    expect(body.text).toContain('"mcpServers"');
    expect(body.text).toContain('[redacted]');
    expect(body.text).not.toContain(LEAK_MARKER);
  });

  it('GET /api/file redacts any mcp.json by basename, e.g. a linked root .mcp.json', async () => {
    const res = await get(app, '/api/file?path=.mcp.json');
    expect(res.status).toBe(200);
    const body = (await res.json()) as FileResponse;
    expect(body.redacted).toBe(true);
    expect(body.text).not.toContain(LEAK_MARKER);
  });

  it('GET /api/file serves linked files with id_ in their name', async () => {
    expect((await get(app, '/api/file?path=docs/id_conventions.md')).status).toBe(200);
  });

  it('the inferred-only file is in the graph, reached only by an inferred edge', async () => {
    const graph = (await (await get(app, '/api/graph')).json()) as AgentGraph;
    const incoming = graph.edges.filter((e) => e.target === 'file:docs/inferred-only.md');
    expect(incoming.length).toBeGreaterThan(0);
    expect(incoming.every((e) => e.evidence === 'inferred')).toBe(true);
  });

  it.each([
    ['.claude/settings.local.json', 403],
    ['docs/inferred-only.md', 404],
  ])('GET /api/file?path=%s → %i (secret config / inferred-only)', async (path, status) => {
    const res = await get(app, `/api/file?path=${encodeURIComponent(path)}`);
    expect(res.status).toBe(status);
    expect(calls.reads).toEqual([]);
  });

  it.each([
    ['../outside.md', 400],
    ['%2e%2e/outside.md', 400],
    ['.cursor/%2e%2e/%2e%2e/etc/passwd', 400],
    ['/etc/passwd', 400],
    ['a\\..\\b', 400],
    ['docs/unlinked.md', 404],
    ['does/not/exist.md', 404],
    ['.env', 403],
  ])('GET /api/file?path=%s → %i without reading arbitrary files', async (path, status) => {
    const res = await get(app, `/api/file?path=${encodeURIComponent(path)}`);
    expect(res.status).toBe(status);
    expect(calls.reads).toEqual([]);
  });

  it('GET /api/file without a path is a 400', async () => {
    expect((await get(app, '/api/file')).status).toBe(400);
  });

  it('round-trips view state through PUT and GET', async () => {
    const view = {
      schemaVersion: 1,
      pinned: { 'skill:.cursor/skills/code-review': { x: 1, y: 2 } },
    };
    expect((await send(app, 'PUT', '/api/view-state', view)).status).toBe(200);
    expect(await (await get(app, '/api/view-state')).json()).toEqual(view);
  });

  it.each([
    ['wrong schema', { schemaVersion: 2, pinned: {} }],
    ['non-finite position', '{"schemaVersion":1,"pinned":{"a":{"x":1e999,"y":0}}}'],
    ['malformed JSON', '{'],
  ])('rejects invalid view state (%s) with 400', async (_name, body) => {
    expect((await send(app, 'PUT', '/api/view-state', body)).status).toBe(400);
    expect(calls.puts).toBe(0);
  });

  it('rejects oversized bodies with 413', async () => {
    const pinned = Object.fromEntries(
      Array.from({ length: 40_000 }, (_, i) => [`node-${i}`, { x: i, y: i }]),
    );
    const res = await send(app, 'PUT', '/api/view-state', { schemaVersion: 1, pinned });
    expect(res.status).toBe(413);
    expect(calls.puts).toBe(0);
  });

  it('never returns a sentinel secret from any route', async () => {
    const responses = await Promise.all([
      get(app, '/api/meta'),
      get(app, '/api/graph'),
      send(app, 'POST', '/api/scan', {}),
      get(app, '/api/file?path=.cursor/mcp.json'),
      get(app, '/api/file?path=.env'),
      get(app, '/api/view-state'),
      send(app, 'POST', '/api/edits/preview', {
        path: '.cursor/mcp.json',
        expectedHash: 'a'.repeat(64),
        newText: leakyMcpJson(),
      }),
      send(app, 'POST', '/api/edits/apply', {
        path: '.env',
        expectedHash: 'a'.repeat(64),
        newText: `TOKEN=${LEAK_MARKER}`,
      }),
    ]);
    const graph = (await (await get(app, '/api/graph')).json()) as AgentGraph;
    const paths = new Set(graph.nodes.flatMap((n) => (n.source ? [n.source.path] : [])));
    for (const path of paths) {
      responses.push(await get(app, `/api/file?path=${encodeURIComponent(path)}`));
    }
    expect(paths.has('.env')).toBe(true);
    for (const res of responses) expect(await res.text()).not.toContain(LEAK_MARKER);
  });
});

describe('request guard', () => {
  const app = createApp(fakeServices(repoFiles(), 'memory:x').services);

  it.each(['evil.example.com', 'evil.example.com:5173', '127.0.0.1.nip.io', '0.0.0.0:5173', ''])(
    'rejects Host %j with 403',
    async (host) => {
      const res = await app.request('/api/meta', { headers: { host } });
      expect(res.status).toBe(403);
    },
  );

  it('accepts localhost and 127.0.0.1 on any port', async () => {
    for (const host of ['localhost', 'localhost:4173', '127.0.0.1:5173']) {
      expect((await app.request('/api/meta', { headers: { host } })).status).toBe(200);
    }
  });

  it.each([
    ['cross-site Origin', { origin: 'http://evil.example.com' }],
    ['other local port', { origin: 'http://127.0.0.1:9999' }],
    ['null Origin', { origin: 'null' }],
    ['Sec-Fetch-Site cross-site', { 'sec-fetch-site': 'cross-site' }],
    ['Sec-Fetch-Site same-site', { 'sec-fetch-site': 'same-site' }],
  ])('rejects mutating requests with %s (403)', async (_name, headers) => {
    expect((await send(app, 'POST', '/api/scan', {}, headers)).status).toBe(403);
    expect((await send(app, 'PUT', '/api/view-state', emptyViewState(), headers)).status).toBe(403);
  });

  it('rejects mutating requests without a JSON content type (415)', async () => {
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']) {
      const res = await send(app, 'POST', '/api/scan', '{}', { 'content-type': type });
      expect(res.status).toBe(415);
    }
  });

  it('allows same-origin and Origin-less (non-browser) mutating requests', async () => {
    expect((await send(app, 'POST', '/api/scan', {})).status).toBe(200);
    const res = await app.request('/api/scan', {
      method: 'POST',
      headers: { host: HOST, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(200);
  });
});

describe('helpers', () => {
  it('hostnameOf strips ports and lowercases', () => {
    expect(hostnameOf('LOCALHOST:80')).toBe('localhost');
    expect(hostnameOf(undefined)).toBeNull();
  });

  it.each([
    ['.env', true],
    ['config/.env.production', true],
    ['keys/server.pem', true],
    ['.ssh/id_ed25519', true],
    ['.npmrc', true],
    ['aws/credentials', true],
    ['.git-credentials', true],
    ['deploy/prod.env', true],
    ['.pgpass', true],
    ['infra/prod.tfvars', true],
    ['infra/terraform.tfstate', true],
    ['home/.docker/config.json', true],
    ['.kube/config', true],
    ['config/secrets.yaml', true],
    ['keys/putty.ppk', true],
    ['keys/app.jks', true],
    ['.ssh/id_rsa.pub', true],
    ['.claude/settings.local.json', true],
    ['.codex/config.toml', true],
    ['.gemini/settings.json', true],
    ['docs/id_conventions.md', false],
    ['.claude/settings.json', false],
    ['docs/environment.md', false],
    ['.cursor/skills/x/SKILL.md', false],
  ])('isSecretBearingPath(%s) = %s', (path, expected) => {
    expect(isSecretBearingPath(path)).toBe(expected);
  });
});
