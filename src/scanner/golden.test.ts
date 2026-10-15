import { describe, expect, it } from 'vitest';
import { AgentGraphSchema, decodeUtf8Strict, type RepoPath } from '../core';
import { type FixtureName, loadFixture } from '../test-support/fixtures';
import { scan } from './scan';

const FIXTURES: FixtureName[] = [
  'cursor-basic',
  'cursor-edge',
  'agentic-base-snapshot',
  'claude-basic',
  'codex-basic',
];

describe.each(FIXTURES)('fixture %s', (name) => {
  it('matches the golden graph and the schema', async () => {
    const graph = await scan(loadFixture(name));
    expect(() => AgentGraphSchema.parse(graph)).not.toThrow();
    await expect(`${JSON.stringify(graph, null, 2)}\n`).toMatchFileSnapshot(
      `../../fixtures/${name}/expected.graph.json`,
    );
  });

  it('hashes every file and script node', async () => {
    const graph = await scan(loadFixture(name));
    for (const node of graph.nodes.filter((n) => n.kind === 'file' || n.kind === 'script')) {
      expect(node.source?.contentHash, node.id).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('is deterministic', async () => {
    expect(await scan(loadFixture(name))).toEqual(await scan(loadFixture(name)));
  });

  it('gives every explicit edge provenance that slices back to its source text', async () => {
    const source = loadFixture(name);
    const graph = await scan(source);
    const names = new Map(graph.nodes.map((n) => [n.id, n.name]));
    const explicit = graph.edges.filter((e) => e.evidence === 'explicit');
    if (name === 'cursor-basic' || name === 'cursor-edge') {
      expect(explicit.length).toBeGreaterThan(0);
    }
    for (const edge of explicit) {
      const { provenance } = edge;
      expect(provenance?.start, edge.id).toBeDefined();
      if (!provenance?.start || !provenance.end) continue;
      const bytes = await source.read(provenance.path as RepoPath);
      const decoded = bytes ? decodeUtf8Strict(bytes) : null;
      if (!decoded?.ok) throw new Error(`unreadable provenance for ${edge.id}`);
      const slice = decoded.text.slice(provenance.start.offset, provenance.end.offset);
      if (edge.relation === 'contains') {
        expect(slice, edge.id).toBe(JSON.stringify(names.get(edge.target)));
      } else {
        const raw = /"(.*)"/.exec(edge.explanation)?.[1] ?? '';
        expect(raw, edge.id).not.toBe('');
        expect(slice, edge.id).toContain(raw);
      }
    }
  });

  it('never serializes sentinel secrets', async () => {
    const json = JSON.stringify(await scan(loadFixture(name)));
    expect(json).not.toContain('SENTINEL-NOT-A-SECRET');
    expect(json).not.toContain('sentinel-user');
  });
});

describe('cursor-basic specifics', () => {
  it('redacts MCP servers while keeping structure', async () => {
    const graph = await scan(loadFixture('cursor-basic'));
    const server = (n: string) =>
      graph.nodes.find((x) => x.id === `mcp-server:.cursor/mcp.json#${n}`)?.attributes;
    expect(server('local-tools')).toMatchObject({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'example-mcp-server', '--token', '[redacted]'],
      env: { EXAMPLE_HOME: '${env:HOME}', EXAMPLE_TOKEN: '[redacted]' },
      envFile: '.env.mcp',
    });
    expect(server('remote-docs')).toMatchObject({
      transport: 'remote',
      url: 'https://mcp.example.com/sse',
      headers: { Authorization: '[redacted]', 'X-Org': '${env:EXAMPLE_ORG}' },
      auth: { CLIENT_ID: '[redacted]', CLIENT_SECRET: '[redacted]', scopes: '[redacted]' },
    });
    expect(server('local-http')?.url).toBe('http://localhost:8931/mcp');
  });

  it('links root and nested AGENTS.md to their directories and skills to their files', async () => {
    const graph = await scan(loadFixture('cursor-basic'));
    const ids = new Set(graph.edges.map((e) => e.id));
    expect(ids).toContain('applies-to:instruction:AGENTS.md->directory:.#0');
    expect(ids).toContain(
      'applies-to:instruction:packages/api/AGENTS.md->directory:packages/api#0',
    );
    expect(ids).toContain(
      'contains:skill:.cursor/skills/code-review->script:.cursor/skills/code-review/scripts/run-lint.sh#0',
    );
    const shared = graph.edges.filter(
      (e) => e.target === 'file:docs/conventions.md' && e.evidence === 'explicit',
    );
    expect(new Set(shared.map((e) => e.source)).size).toBeGreaterThanOrEqual(3);
    const inferred = graph.edges.filter((e) => e.evidence === 'inferred');
    expect(
      inferred.every((e) => e.confidence !== undefined && e.explanation.includes('heuristic')),
    ).toBe(true);
  });
});

describe('cursor-edge diagnostics cover every case', () => {
  it.each([
    ['unresolved-reference', 'AGENTS.md'],
    ['unresolved-reference', '.cursor/rules/valid.mdc'],
    ['reference-cycle', '.cursor/skills/cycle-a/SKILL.md'],
    ['unknown-frontmatter-field', '.cursor/skills/unknown-fields/SKILL.md'],
    ['malformed-frontmatter', '.cursor/skills/malformed-yaml/SKILL.md'],
    ['skill-name-mismatch', '.cursor/skills/name-mismatch/SKILL.md'],
    ['skill-name-invalid', '.cursor/skills/name-mismatch/SKILL.md'],
    ['rule-not-mdc', '.cursor/rules/notes.md'],
    ['skill-outside-root', 'docs/SKILL.md'],
  ])('%s at %s', async (code, path) => {
    const graph = await scan(loadFixture('cursor-edge'));
    expect(graph.diagnostics.some((d) => d.code === code && d.path === path)).toBe(true);
  });

  it('ignores node_modules, scopes the nested skill root, and reads CRLF/BOM files', async () => {
    const graph = await scan(loadFixture('cursor-edge'));
    expect(JSON.stringify(graph)).not.toContain('vendored');
    expect(graph.edges.map((e) => e.id)).toContain(
      'applies-to:skill:apps/x/.cursor/skills/scoped-skill->directory:apps/x#0',
    );
    const attrs = (id: string) => graph.nodes.find((n) => n.id === id)?.attributes;
    expect(attrs('skill:.cursor/skills/crlf-skill')?.description).toBe(
      'Skill file saved with CRLF line endings.',
    );
    expect(graph.nodes.find((n) => n.id === 'skill:.cursor/skills/bom-skill')?.name).toBe(
      'bom-skill',
    );
    expect(attrs('rule:.cursor/rules/bom-rule.mdc')?.description).toBe(
      'Rule with a UTF-8 BOM and CRLF line endings',
    );
    expect(attrs('skill:.cursor/skills/unknown-fields')?.frontmatter).toMatchObject({
      owner: 'platform-team',
    });
  });
});
