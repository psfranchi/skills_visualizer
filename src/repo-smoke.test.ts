import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AgentGraphSchema } from './core';
import { scan } from './scanner';
import { LocalFileSource } from './server/node/local-file-source';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

describe('smoke: scanning this repository', async () => {
  const graph = AgentGraphSchema.parse(await scan(await LocalFileSource.open(REPO_ROOT)));
  const ids = new Set(graph.nodes.map((n) => n.id));

  it('finds its own skills, agents, rules, and AGENTS.md', () => {
    for (const id of [
      'instruction:AGENTS.md',
      'skill:.cursor/skills/stack-commands',
      'skill:.cursor/skills/explore-codebase',
      'agent:.cursor/agents/builder.md',
      'rule:.cursor/rules/00-core.mdc',
      'rule:.cursor/rules/90-stack.mdc',
    ]) {
      expect(ids, id).toContain(id);
    }
  });

  it('does not treat overlays/*/SKILL.md as skills', () => {
    const skills = graph.nodes.filter((n) => n.kind === 'skill');
    expect(skills.some((n) => n.id.includes('overlays/'))).toBe(false);
  });

  it('finds nothing under fixtures/ as agent config', () => {
    const configKinds = new Set([
      'instruction',
      'rule',
      'skill',
      'agent',
      'mcp-config',
      'mcp-server',
    ]);
    const leaked = graph.nodes.filter((n) => configKinds.has(n.kind) && n.id.includes('fixtures/'));
    expect(leaked).toEqual([]);
  });
});
