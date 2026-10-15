import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type CliIo, run } from './cli/main';
import { MemoryFileSource } from './core';
import { scan } from './scanner';
import { LEAK_MARKER, leakyMcpConfig, leakyMcpJson } from './test-support/leaky-mcp';

describe('end to end: MCP redaction bypass shapes never leak', () => {
  let repo = '';

  beforeAll(async () => {
    repo = await mkdtemp(path.join(tmpdir(), 'sv-leak-'));
    await mkdir(path.join(repo, '.cursor'));
    await writeFile(path.join(repo, '.cursor', 'mcp.json'), leakyMcpJson());
  });

  afterAll(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it('the fixture really contains the secrets', () => {
    expect(leakyMcpJson().split(LEAK_MARKER).length - 1).toBeGreaterThanOrEqual(19);
  });

  it('keeps them out of the serialized graph', async () => {
    const graph = await scan(new MemoryFileSource({ '.cursor/mcp.json': leakyMcpJson() }));
    const servers = graph.nodes.filter((n) => n.kind === 'mcp-server');
    expect(servers.map((n) => n.name).sort()).toEqual(
      Object.keys(leakyMcpConfig().mcpServers).sort(),
    );
    expect(JSON.stringify(graph)).not.toContain(LEAK_MARKER);
  });

  it('keeps them out of CLI stdout and stderr', async () => {
    const out: string[] = [];
    const err: string[] = [];
    const io: CliIo = { stdout: (t) => out.push(t), stderr: (t) => err.push(t), cwd: repo };
    expect(await run(['scan', '.'], io)).toBe(0);
    expect(out.join('')).toContain('mcp-server:.cursor/mcp.json#positional');
    expect(out.join('')).not.toContain(LEAK_MARKER);
    expect(err.join('')).not.toContain(LEAK_MARKER);
  });
});
