import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgentGraphSchema } from '../core';
import { materializeFixture } from '../test-support/fixtures';
import { type CliIo, parseCommand, parseScanArgs, parseServerArgs, run } from './main';

describe('parseCommand', () => {
  it.each(['scan', 'dev', 'serve'] as const)('recognizes %s', (command) => {
    expect(parseCommand([command, 'fixtures/cursor-basic'])).toBe(command);
  });

  it('returns null for unknown or missing commands', () => {
    expect(parseCommand(['deploy'])).toBeNull();
    expect(parseCommand([])).toBeNull();
  });
});

describe('parseScanArgs', () => {
  it('parses dir and --out', () => {
    expect(parseScanArgs(['.'])).toEqual({ dir: '.' });
    expect(parseScanArgs(['repo', '--out', 'g.json'])).toEqual({ dir: 'repo', out: 'g.json' });
    expect(parseScanArgs(['--out=g.json', 'repo'])).toEqual({ dir: 'repo', out: 'g.json' });
  });

  it('rejects missing dir, dangling --out, and unknown flags', () => {
    expect(parseScanArgs([])).toBeNull();
    expect(parseScanArgs([''])).toBeNull();
    expect(parseScanArgs(['repo', '--out='])).toBeNull();
    expect(parseScanArgs(['repo', '--out'])).toBeNull();
    expect(parseScanArgs(['repo', '--verbose'])).toBeNull();
  });
});

describe('parseServerArgs', () => {
  it('defaults dir to . and parses --port', () => {
    expect(parseServerArgs([])).toEqual({ dir: '.' });
    expect(parseServerArgs(['repo', '--port', '5000'])).toEqual({ dir: 'repo', port: 5000 });
    expect(parseServerArgs(['--port=6000'])).toEqual({ dir: '.', port: 6000 });
  });

  it('rejects bad ports, extra dirs, and unknown flags', () => {
    expect(parseServerArgs(['--port'])).toBeNull();
    expect(parseServerArgs(['--port', '0'])).toBeNull();
    expect(parseServerArgs(['--port', '70000'])).toBeNull();
    expect(parseServerArgs(['--port', '12ab'])).toBeNull();
    expect(parseServerArgs(['a', 'b'])).toBeNull();
    expect(parseServerArgs(['--host', '0.0.0.0'])).toBeNull();
  });
});

function captureIo(cwd: string) {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = { stdout: (t) => out.push(t), stderr: (t) => err.push(t), cwd };
  return { io, out, err };
}

describe('scan command', () => {
  let repo = '';
  let outDir = '';

  beforeAll(async () => {
    repo = await materializeFixture('cursor-basic');
    outDir = await mkdtemp(path.join(tmpdir(), 'sv-out-'));
  });

  afterAll(async () => {
    await rm(repo, { recursive: true, force: true });
    await rm(outDir, { recursive: true, force: true });
  });

  it('prints schema-v1 graph JSON for a materialized fixture', async () => {
    const { io, out, err } = captureIo(path.dirname(repo));
    expect(await run(['scan', path.basename(repo)], io)).toBe(0);
    const graph = AgentGraphSchema.parse(JSON.parse(out.join('')));
    expect(graph.schemaVersion).toBe(1);
    expect(graph.nodes.some((n) => n.id === 'skill:.cursor/skills/code-review')).toBe(true);
    expect(err.join('\n')).toMatch(/^nodes: \d+/);
    expect(out.join('')).not.toContain('SENTINEL-NOT-A-SECRET');
  });

  it('identifies the source by folder name only, never the absolute path', async () => {
    const { io, out, err } = captureIo(outDir);
    expect(await run(['scan', repo], io)).toBe(0);
    const graph = AgentGraphSchema.parse(JSON.parse(out.join('')));
    expect(graph.source.id).toBe(`local:${path.basename(repo)}`);
    expect(out.join('')).not.toContain(path.dirname(repo));
    expect(err.join('')).not.toContain(path.dirname(repo));
  });

  it('writes to --out instead of stdout', async () => {
    const { io, out } = captureIo(outDir);
    expect(await run(['scan', repo, '--out', 'graph.json'], io)).toBe(0);
    expect(out).toEqual([]);
    AgentGraphSchema.parse(JSON.parse(await readFile(path.join(outDir, 'graph.json'), 'utf8')));
  });

  it('fails with a message for a missing directory and usage for bad args', async () => {
    const missing = captureIo(outDir);
    expect(await run(['scan', 'does-not-exist'], missing.io)).toBe(1);
    expect(missing.err.join('')).toContain('skills-visualizer scan:');
    const usage = captureIo(outDir);
    expect(await run(['scan'], usage.io)).toBe(2);
    expect(usage.err.join('')).toContain('Usage:');
  });
});
