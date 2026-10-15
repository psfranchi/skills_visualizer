import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AgentGraphSchema, publicGraph } from '../core';
import { scan } from '../scanner';
import { LocalFileSource } from '../server/node/local-file-source';

const COMMANDS = ['scan', 'dev', 'serve'] as const;
type Command = (typeof COMMANDS)[number];

const USAGE = `Usage:
  skills-visualizer scan <dir> [--out <file>]
  skills-visualizer dev [dir] [--port <n>]
  skills-visualizer serve [dir] [--port <n>]`;

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** Base for relative paths (pnpm runs scripts from the package root; INIT_CWD is the caller's cwd). */
  cwd: string;
}

export function parseCommand(argv: readonly string[]): Command | null {
  const [first] = argv;
  return COMMANDS.find((c) => c === first) ?? null;
}

export interface ScanArgs {
  dir: string;
  out?: string;
}

export function parseScanArgs(args: readonly string[]): ScanArgs | null {
  let dir: string | undefined;
  let out: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--out') {
      out = args[++i];
      if (out === undefined) return null;
    } else if (arg?.startsWith('--out=')) {
      out = arg.slice('--out='.length);
    } else if (arg !== undefined && dir === undefined && !arg.startsWith('--')) {
      dir = arg;
    } else {
      return null;
    }
  }
  if (!dir || out === '') return null;
  return out === undefined ? { dir } : { dir, out };
}

export interface ServerArgs {
  dir: string;
  port?: number;
}

function parsePort(value: string | undefined): number | null {
  if (value === undefined || !/^\d{1,5}$/.test(value)) return null;
  const port = Number(value);
  return port >= 1 && port <= 65535 ? port : null;
}

/** `[dir] [--port <n>]`; dir defaults to `.`. */
export function parseServerArgs(args: readonly string[]): ServerArgs | null {
  let dir: string | undefined;
  let port: number | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const inline = arg?.startsWith('--port=') ? arg.slice('--port='.length) : undefined;
    if (arg === '--port' || inline !== undefined) {
      const parsed = parsePort(inline ?? args[++i]);
      if (parsed === null) return null;
      port = parsed;
    } else if (arg !== undefined && arg !== '' && dir === undefined && !arg.startsWith('--')) {
      dir = arg;
    } else {
      return null;
    }
  }
  return port === undefined ? { dir: dir ?? '.' } : { dir: dir ?? '.', port };
}

async function runServer(
  command: 'dev' | 'serve',
  args: readonly string[],
  io: CliIo,
): Promise<number> {
  const parsed = parseServerArgs(args);
  if (!parsed) {
    io.stderr(USAGE);
    return 2;
  }
  const { startDevServer, startStaticServer } = await import('../server/node/main');
  const root = path.resolve(io.cwd, parsed.dir);
  const start = command === 'dev' ? startDevServer : startStaticServer;
  const server = await start({ root, ...(parsed.port === undefined ? {} : { port: parsed.port }) });
  // Token only appears in this terminal line; never in API responses or the graph.
  io.stderr(
    `skills-visualizer ${command}: ${server.url}?token=${server.token} (root: ${path.basename(root)})`,
  );
  return 0;
}

function summarize(counts: Iterable<string>): string {
  const tally = new Map<string, number>();
  for (const key of counts) tally.set(key, (tally.get(key) ?? 0) + 1);
  return [...tally]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, count]) => `${key}=${count}`)
    .join(' ');
}

async function runScan(args: readonly string[], io: CliIo): Promise<number> {
  const parsed = parseScanArgs(args);
  if (!parsed) {
    io.stderr(USAGE);
    return 2;
  }
  const source = await LocalFileSource.open(path.resolve(io.cwd, parsed.dir));
  const graph = publicGraph(AgentGraphSchema.parse(await scan(source)));
  const json = `${JSON.stringify(graph, null, 2)}\n`;
  if (parsed.out) {
    await writeFile(path.resolve(io.cwd, parsed.out), json);
  } else {
    io.stdout(json);
  }
  io.stderr(
    [
      `nodes: ${graph.nodes.length} (${summarize(graph.nodes.map((n) => n.kind))})`,
      `edges: ${graph.edges.length} (${summarize(graph.edges.map((e) => `${e.relation}/${e.evidence}`))})`,
      `diagnostics: ${graph.diagnostics.length} (${summarize(graph.diagnostics.map((d) => d.severity))})`,
    ].join('\n'),
  );
  return 0;
}

export async function run(argv: readonly string[], io: CliIo): Promise<number> {
  const command = parseCommand(argv);
  if (command === null) {
    io.stderr(USAGE);
    return 2;
  }
  try {
    return command === 'scan'
      ? await runScan(argv.slice(1), io)
      : await runServer(command, argv.slice(1), io);
  } catch (error) {
    io.stderr(
      `skills-visualizer ${command}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await run(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(`${text}\n`),
    cwd: process.env.INIT_CWD ?? process.cwd(),
  });
}
