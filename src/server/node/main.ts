import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { getRequestListener, serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createServer as createViteServer, type Plugin } from 'vite';
import { createApp } from '../app';
import { createAuthToken, isTokenExchangePath } from '../auth';
import { FRAME_HEADERS } from '../frame-headers';
import { createLocalServices } from './services';

export const HOST = '127.0.0.1';
export const DEFAULT_DEV_PORT = 5173;
export const DEFAULT_SERVE_PORT = 4173;

const VITE_CONFIG = fileURLToPath(new URL('../../../vite.config.ts', import.meta.url));
const WEB_DIST = fileURLToPath(new URL('../../../dist/web', import.meta.url));

export interface RunningServer {
  url: string;
  /** Present so tests can use Bearer auth; never printed except via `url`. */
  token: string;
  close(): Promise<void>;
}

export interface ServerOptions {
  root: string;
  port?: number;
  stateDir?: string;
  /** Built UI directory for `startStaticServer`; defaults to `dist/web`. */
  webDir?: string;
  /** Override the process token (tests). When omitted, a random token is generated. */
  authToken?: string;
}

function isApiPath(url: string | undefined): boolean {
  return url === '/api' || url?.startsWith('/api/') === true || url?.startsWith('/api?') === true;
}

/** One process: Vite (JS API) for the UI with the Hono app mounted on `/api`, bound to 127.0.0.1. */
export async function startDevServer(options: ServerOptions): Promise<RunningServer> {
  const token = options.authToken ?? createAuthToken();
  const services = await createLocalServices(options.root, { stateDir: options.stateDir });
  const app = createApp(services, { auth: { token } });
  const listener = getRequestListener(app.fetch);
  const api: Plugin = {
    name: 'skills-visualizer-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (isApiPath(req.url) || isTokenExchangePath(req.url)) void listener(req, res);
        else next();
      });
    },
  };
  const vite = await createViteServer({
    configFile: VITE_CONFIG,
    server: { host: HOST, port: options.port ?? DEFAULT_DEV_PORT },
    plugins: [api],
  });
  await vite.listen();
  const address = vite.httpServer?.address() as AddressInfo | null;
  const port = address?.port ?? options.port ?? DEFAULT_DEV_PORT;
  return {
    url: `http://${HOST}:${port}/`,
    token,
    close: () => vite.close(),
  };
}

/** Serves the built UI from `dist/web` plus the API, bound to 127.0.0.1. */
export async function startStaticServer(options: ServerOptions): Promise<RunningServer> {
  const webDir = options.webDir ?? WEB_DIST;
  if (!existsSync(webDir)) throw new Error('dist/web not found; run `pnpm build` first.');
  const token = options.authToken ?? createAuthToken();
  const services = await createLocalServices(options.root, { stateDir: options.stateDir });
  const app = new Hono()
    .use('*', async (c, next) => {
      await next();
      for (const [name, value] of Object.entries(FRAME_HEADERS)) c.res.headers.set(name, value);
    })
    .route('/', createApp(services, { auth: { token } }))
    .use('/*', serveStatic({ root: webDir }));
  return new Promise((resolve, reject) => {
    const server = serve(
      { fetch: app.fetch, hostname: HOST, port: options.port ?? DEFAULT_SERVE_PORT },
      (info) => {
        resolve({
          url: `http://${HOST}:${info.port}/`,
          token,
          close: () =>
            new Promise<void>((done, fail) => server.close((err) => (err ? fail(err) : done()))),
        });
      },
    );
    server.once('error', reject);
  });
}
