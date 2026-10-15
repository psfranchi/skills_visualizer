import { describe, expect, it } from 'vitest';
import { MemoryFileSource } from '../../../core';
import { scan } from '../../scan';

async function scanFiles(files: Record<string, string>) {
  return scan(new MemoryFileSource(files, { id: 'memory:adapter-test' }));
}

describe('cursor adapter', () => {
  it('computes the four rule activation modes', async () => {
    const graph = await scanFiles({
      '.cursor/rules/always.mdc': '---\nalwaysApply: true\n---\n',
      '.cursor/rules/files.mdc': '---\nglobs: src/**/*.ts, test/**\nalwaysApply: false\n---\n',
      '.cursor/rules/smart.mdc': '---\ndescription: When editing docs\n---\n',
      '.cursor/rules/manual.mdc': '# No frontmatter\n',
      '.cursor/rules/lenient.mdc': '---\nglobs: *.tsx\n---\n',
    });
    const activation = Object.fromEntries(
      graph.nodes.filter((n) => n.kind === 'rule').map((n) => [n.name, n.attributes.activation]),
    );
    expect(activation).toEqual({
      always: 'always-apply',
      files: 'apply-to-specific-files',
      smart: 'apply-intelligently',
      manual: 'apply-manually',
      lenient: 'apply-to-specific-files',
    });
    expect(graph.nodes.find((n) => n.name === 'files')?.attributes.globs).toEqual([
      'src/**/*.ts',
      'test/**',
    ]);
    expect(graph.diagnostics.find((d) => d.code === 'frontmatter-not-yaml')?.path).toBe(
      '.cursor/rules/lenient.mdc',
    );
  });

  it('gives agents shadowed by .cursor a diagnostic and defaults model to inherit', async () => {
    const graph = await scanFiles({
      '.cursor/agents/reviewer.md': '---\nname: reviewer\n---\n',
      '.claude/agents/reviewer.md': '---\nname: reviewer\n---\n',
      '.codex/agents/other.md': '---\ndescription: d\n---\n',
    });
    const shadowed = graph.diagnostics.filter((d) => d.code === 'agent-shadowed');
    expect(shadowed.map((d) => d.nodeId)).toEqual(['agent:.claude/agents/reviewer.md']);
    const other = graph.nodes.find((n) => n.id === 'agent:.codex/agents/other.md');
    expect(other?.name).toBe('other');
    expect(other?.attributes.model).toBe('inherit');
    expect(other?.attributes.root).toBe('.codex');
  });

  it('never echoes mcp.json content in parse errors', async () => {
    const graph = await scanFiles({
      '.cursor/mcp.json':
        '{ "mcpServers": { "x": { "env": { "K": "SENTINEL-NOT-A-SECRET-Z1" } } }, }',
    });
    const [diagnostic] = graph.diagnostics.filter((d) => d.code === 'mcp-json-invalid');
    expect(diagnostic?.severity).toBe('error');
    expect(JSON.stringify(graph)).not.toContain('SENTINEL');
  });

  it('checks skill name and description', async () => {
    const graph = await scanFiles({
      '.cursor/skills/good/SKILL.md': '---\nname: good\ndescription: Fine.\n---\n',
      '.cursor/skills/bare/SKILL.md': '# No frontmatter\n',
      '.cursor/skills/long/SKILL.md': `---\nname: long\ndescription: ${'x'.repeat(1025)}\n---\n`,
    });
    const codes = (id: string) => graph.nodes.find((n) => n.id === id)?.diagnostics;
    expect(codes('skill:.cursor/skills/good')).toEqual([]);
    expect(codes('skill:.cursor/skills/bare')).toEqual(['skill-frontmatter-missing']);
    expect(codes('skill:.cursor/skills/long')).toEqual(['skill-description-too-long']);
  });

  it('diagnoses ambiguous rule @mentions and prefers the repo root', async () => {
    const graph = await scanFiles({
      '.cursor/rules/r.mdc': 'Read @guide.md.\n',
      '.cursor/rules/guide.md': 'local',
      'guide.md': 'root',
    });
    expect(graph.diagnostics.map((d) => d.code)).toContain('ambiguous-reference');
    expect(graph.edges.find((e) => e.evidence === 'explicit')?.target).toBe('file:guide.md');
  });
});
