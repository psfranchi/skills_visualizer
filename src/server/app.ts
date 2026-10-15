import { type Context, Hono, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';
import { z } from 'zod';
import {
  type AgentGraph,
  type FileSource,
  type FileSourceCapabilities,
  type GraphDiagnostic,
  type GraphViewState,
  GraphViewStateSchema,
  normalizeRepoPath,
  publicGraph,
  type RepoPath,
  type SCHEMA_VERSION,
} from '../core';
import { redactMcpConfigText } from '../scanner';
import { handleTokenExchange, requireAuth } from './auth';
import { applyEdit, type EditInput, previewEdit } from './edits';

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

export interface EditPreviewResponse {
  diff: string;
  /** True when the unified diff was omitted because the file was too large. */
  diffTruncated: boolean;
  diagnostics: GraphDiagnostic[];
  impact: { edgesAdded: string[]; edgesRemoved: string[] };
  blocking: boolean;
}

export interface EditApplyResponse {
  hash: string;
  graph: AgentGraph;
}

export interface Services {
  meta(): Promise<Meta>;
  graph(opts?: { rescan?: boolean }): Promise<AgentGraph>;
  /** Raw UTF-8 text of a repo file, or null. The app decides which paths may be served and redacts. */
  file(path: RepoPath): Promise<RawFile | null>;
  getView(): Promise<GraphViewState>;
  putView(view: GraphViewState): Promise<void>;
  /** Underlying file source for edit preview/apply (write capability gates the UI). */
  source(): FileSource;
  /** Drop the cached graph after a successful write. */
  invalidateGraph(): void;
}

const ALLOWED_HOSTNAMES = new Set(['127.0.0.1', 'localhost']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const MAX_BODY_BYTES = 1024 * 1024;

/** Basenames that may hold credentials; never served even when the graph references them. */
const SECRET_BEARING_FILE =
  /^(?:\.env(?:\..*)?|.*\.env|\.envrc|\.npmrc|\.pypirc|\.netrc|\.git-credentials|\.pgpass|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|credentials.*|secrets\..*|.*\.(?:pem|key|p12|pfx|keystore|jks|ppk|tfvars|tfstate(?:\.backup)?))$/i;
/** Agent / tool configs that may hold tokens; identified by their parent folder. */
const SECRET_BEARING_CONFIG =
  /(?:^|\/)(?:\.claude\/settings\.local\.json|\.codex\/config\.toml|\.gemini\/settings\.json|\.docker\/config\.json|\.kube\/config)$/i;
/** MCP configs are served re-serialized without secrets. */
const MCP_CONFIG_FILE = /^\.?mcp\.json$/i;
/** File / script nodes are servable only when something references them for sure. */
const SERVABLE_EVIDENCE = new Set(['explicit', 'derived']);

export function hostnameOf(host: string | undefined): string | null {
  if (!host) return null;
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function isSecretBearingPath(path: string): boolean {
  return SECRET_BEARING_FILE.test(basename(path)) || SECRET_BEARING_CONFIG.test(path);
}

function error(c: Context, status: 400 | 401 | 403 | 404 | 413 | 415 | 500, message: string) {
  return c.json({ error: message }, status);
}

export interface AppOptions {
  /** When set, `/api/*` requires the cookie or Bearer token; `GET /?token=` exchanges it. */
  auth?: { token: string };
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
const EditRequestSchema = z
  .object({
    path: z.string().min(1).max(4096),
    expectedHash: z.string().regex(/^[0-9a-f]{64}$/),
    newText: z.string().max(MAX_BODY_BYTES),
  })
  .strict();

function editFailure(
  c: Context,
  failure: {
    status: 400 | 403 | 404 | 409;
    message?: string;
    currentHash?: string;
    diagnostics?: GraphDiagnostic[];
  },
) {
  if (failure.status === 409) {
    return c.json({ error: 'conflict', currentHash: failure.currentHash }, 409);
  }
  return c.json(
    {
      error: failure.message ?? 'Request failed',
      ...(failure.diagnostics ? { diagnostics: failure.diagnostics } : {}),
    },
    failure.status,
  );
}

async function parseEditInput(
  c: Context,
  body: z.infer<typeof EditRequestSchema>,
): Promise<EditInput | Response> {
  let path: RepoPath;
  try {
    path = normalizeRepoPath(body.path);
  } catch {
    return error(c, 400, 'Invalid path');
  }
  if (isSecretBearingPath(path)) return error(c, 403, 'File may contain secrets');
  if (MCP_CONFIG_FILE.test(basename(path))) return error(c, 403, 'MCP config is not editable');
  return { path, expectedHash: body.expectedHash, newText: body.newText };
}

function parseWith<T extends z.ZodType>(schema: T) {
  return (value: unknown, c: Context) => {
    const result = schema.safeParse(value);
    if (!result.success) return error(c, 400, 'Invalid request');
    return result.data as z.infer<T>;
  };
}

/**
 * Repo paths that are some node's source, mapped to whether they must be redacted. File / script
 * nodes count only when an explicit or derived edge reaches them (inferred guesses do not).
 */
function servablePaths(graph: AgentGraph): Map<string, { redact: boolean }> {
  const referenced = new Set(
    graph.edges.filter((e) => SERVABLE_EVIDENCE.has(e.evidence)).map((e) => e.target),
  );
  const paths = new Map<string, { redact: boolean }>();
  for (const node of graph.nodes) {
    const path = node.source?.path;
    if (path === undefined) continue;
    if ((node.kind === 'file' || node.kind === 'script') && !referenced.has(node.id)) continue;
    const redact =
      node.kind === 'mcp-config' ||
      node.kind === 'mcp-server' ||
      MCP_CONFIG_FILE.test(basename(path));
    paths.set(path, { redact: redact || (paths.get(path)?.redact ?? false) });
  }
  return paths;
}

function createApiApp(services: Services, authToken: string | undefined) {
  const app = new Hono().basePath('/api');
  app.use('*', async (c, next) => {
    if (authToken) return requireAuth(authToken)(c, next);
    await next();
  });
  return app
    .use('*', guard)
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
    .post(
      '/edits/preview',
      bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => error(c, 413, 'Payload too large') }),
      validator('json', parseWith(EditRequestSchema)),
      async (c) => {
        const parsed = await parseEditInput(c, c.req.valid('json'));
        if (parsed instanceof Response) return parsed;
        const outcome = await previewEdit(services.source(), parsed);
        if (!outcome.ok) return editFailure(c, outcome);
        return c.json(outcome.preview satisfies EditPreviewResponse);
      },
    )
    .post(
      '/edits/apply',
      bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => error(c, 413, 'Payload too large') }),
      validator('json', parseWith(EditRequestSchema)),
      async (c) => {
        const parsed = await parseEditInput(c, c.req.valid('json'));
        if (parsed instanceof Response) return parsed;
        const outcome = await applyEdit(services.source(), parsed);
        if (!outcome.ok) return editFailure(c, outcome);
        services.invalidateGraph();
        const body: EditApplyResponse = {
          hash: outcome.hash,
          graph: publicGraph(outcome.graph),
        };
        return c.json(body);
      },
    )
    .onError((err, c) =>
      err instanceof HTTPException && err.status === 400
        ? error(c, 400, 'Invalid request')
        : error(c, 500, 'Internal error'),
    )
    .notFound((c) => error(c, 404, 'Not found'));
}

/**
 * Full app: optional `GET /?token=` exchange, then `/api/*`.
 * `AppType` is the `/api` tree so the hc client keeps `client.api.*` paths.
 */
export function createApp(services: Services, options: AppOptions = {}) {
  const authToken = options.auth?.token;
  const api = createApiApp(services, authToken);
  const root = new Hono();
  root.use('*', async (c, next) => {
    if (
      authToken &&
      c.req.method === 'GET' &&
      (c.req.path === '/' || c.req.path === '') &&
      c.req.query('token') !== undefined
    ) {
      return handleTokenExchange(c, authToken);
    }
    await next();
  });
  return root.route('/', api);
}

/** Typed `/api` surface for the web hc client (not the root wrapper). */
export type AppType = ReturnType<typeof createApiApp>;
