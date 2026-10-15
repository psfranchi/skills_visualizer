import { type Context, Hono, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';
import { z } from 'zod';
import {
  type AgentGraph,
  type FileSourceCapabilities,
  type GraphViewState,
  GraphViewStateSchema,
  normalizeRepoPath,
  publicGraph,
  type RepoPath,
  type SCHEMA_VERSION,
} from '../core';
import { redactMcpConfigText } from '../scanner';

// Must stay runtime-agnostic: the web app imports `AppType`, and a hosted mode would supply other `Services`.

export interface Meta {
  /** Root folder name only; the absolute local path is never exposed. */
  displayName: string;
  capabilities: FileSourceCapabilities;
  schemaVersion: typeof SCHEMA_VERSION;
}

export interface RawFile {
  text: string;
  hash: string;
}

export interface FileResponse extends RawFile {
  path: RepoPath;
  /** True when the text was re-serialized without secrets (offsets no longer match the source). */
  redacted: boolean;
}

export interface Services {
  meta(): Promise<Meta>;
  graph(opts?: { rescan?: boolean }): Promise<AgentGraph>;
  /** Raw UTF-8 text of a repo file, or null. The app decides which paths may be served and redacts. */
  file(path: RepoPath): Promise<RawFile | null>;
  getView(): Promise<GraphViewState>;
  putView(view: GraphViewState): Promise<void>;
}

const ALLOWED_HOSTNAMES = new Set(['127.0.0.1', 'localhost']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const MAX_BODY_BYTES = 1024 * 1024;

/** Basenames that may hold credentials; never served even when the graph references them. */
const SECRET_BEARING_FILE =
  /^(?:\.env(?:\..*)?|\.envrc|\.npmrc|\.pypirc|\.netrc|id_.*|credentials.*|.*\.(?:pem|key|p12|pfx|keystore))$/i;

export function hostnameOf(host: string | undefined): string | null {
  if (!host) return null;
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
}

export function isSecretBearingPath(path: string): boolean {
  return SECRET_BEARING_FILE.test(path.slice(path.lastIndexOf('/') + 1));
}

function error(c: Context, status: 400 | 403 | 404 | 413 | 415 | 500, message: string) {
  return c.json({ error: message }, status);
}

/**
 * DNS-rebinding and CSRF guard: the Host must be loopback; mutating requests need a JSON body
 * and, when the browser sends one, a same-origin `Origin` / `Sec-Fetch-Site`.
 */
const guard: MiddlewareHandler = async (c, next) => {
  const host = c.req.header('host');
  const hostname = hostnameOf(host);
  if (!hostname || !ALLOWED_HOSTNAMES.has(hostname)) return error(c, 403, 'Forbidden host');
  if (!SAFE_METHODS.has(c.req.method)) {
    const origin = c.req.header('origin');
    if (origin !== undefined && origin !== `http://${host}`) {
      return error(c, 403, 'Cross-origin request rejected');
    }
    const site = c.req.header('sec-fetch-site');
    if (site !== undefined && site !== 'same-origin' && site !== 'none') {
      return error(c, 403, 'Cross-site request rejected');
    }
    const contentType = c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (contentType !== 'application/json') return error(c, 415, 'Expected application/json');
  }
  await next();
  c.res.headers.set('Cache-Control', 'no-store');
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
};

const ScanRequestSchema = z.object({}).strict();
const FileQuerySchema = z.object({ path: z.string().min(1).max(4096) });

function parseWith<T extends z.ZodType>(schema: T) {
  return (value: unknown, c: Context) => {
    const result = schema.safeParse(value);
    if (!result.success) return error(c, 400, 'Invalid request');
    return result.data as z.infer<T>;
  };
}

/** Repo paths that are some node's source, mapped to whether they must be redacted. */
function servablePaths(graph: AgentGraph): Map<string, { redact: boolean }> {
  const paths = new Map<string, { redact: boolean }>();
  for (const node of graph.nodes) {
    const path = node.source?.path;
    if (path === undefined) continue;
    const redact =
      node.kind === 'mcp-config' ||
      node.kind === 'mcp-server' ||
      path.endsWith('/mcp.json') ||
      path === 'mcp.json';
    paths.set(path, { redact: redact || (paths.get(path)?.redact ?? false) });
  }
  return paths;
}

export function createApp(services: Services) {
  return new Hono()
    .basePath('/api')
    .use(guard)
    .get('/meta', async (c) => c.json(await services.meta()))
    .get('/graph', async (c) => c.json(publicGraph(await services.graph())))
    .post(
      '/scan',
      bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => error(c, 413, 'Payload too large') }),
      validator('json', parseWith(ScanRequestSchema)),
      async (c) => c.json(publicGraph(await services.graph({ rescan: true }))),
    )
    .get('/file', validator('query', parseWith(FileQuerySchema)), async (c) => {
      let path: RepoPath;
      try {
        path = normalizeRepoPath(c.req.valid('query').path);
      } catch {
        return error(c, 400, 'Invalid path');
      }
      const known = servablePaths(await services.graph()).get(path);
      if (!known) return error(c, 404, 'Not a graph file');
      if (isSecretBearingPath(path)) return error(c, 403, 'File may contain secrets');
      const file = await services.file(path);
      if (!file) return error(c, 404, 'File not readable');
      const body: FileResponse = {
        path,
        text: known.redact ? redactMcpConfigText(file.text) : file.text,
        hash: file.hash,
        redacted: known.redact,
      };
      return c.json(body);
    })
    .get('/view-state', async (c) => c.json(await services.getView()))
    .put(
      '/view-state',
      bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => error(c, 413, 'Payload too large') }),
      validator('json', parseWith(GraphViewStateSchema)),
      async (c) => {
        const view = c.req.valid('json');
        await services.putView(view);
        return c.json(view);
      },
    )
    .onError((err, c) =>
      err instanceof HTTPException && err.status === 400
        ? error(c, 400, 'Invalid request')
        : error(c, 500, 'Internal error'),
    )
    .notFound((c) => error(c, 404, 'Not found'));
}

export type AppType = ReturnType<typeof createApp>;
