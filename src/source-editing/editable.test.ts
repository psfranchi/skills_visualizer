import { describe, expect, it } from 'vitest';
import type { AgentGraph, AgentNode, RepoPath } from '../core';
import { MemoryFileSource } from '../core';
import { scan } from '../scanner';
import { readFixtureFiles } from '../test-support/fixtures';
import { editableSkillPaths, nodeIsEditable } from './editable';

describe('editableSkillPaths / nodeIsEditable', () => {
  it('lists discovered skill paths and gates the UI helper on write + kind', async () => {
    const source = new MemoryFileSource(readFixtureFiles('cursor-basic'), { id: 'memory:edit' });
    const graph = await scan(source);
    const paths = await source.list();
    const editable = editableSkillPaths(graph, paths);
    expect(editable.has('.cursor/skills/code-review/SKILL.md' as RepoPath)).toBe(true);
    expect(editable.has('AGENTS.md' as RepoPath)).toBe(false);

    const skill = graph.nodes.find(
      (n) => n.kind === 'skill' && n.source?.path.includes('code-review'),
    );
    expect(skill).toBeDefined();
    expect(nodeIsEditable(skill ?? null, true, editable)).toBe(true);
    expect(nodeIsEditable(skill ?? null, false, editable)).toBe(false);
    expect(nodeIsEditable(null, true, editable)).toBe(false);

    const nonSkill = graph.nodes.find((n) => n.kind !== 'skill') as AgentNode | undefined;
    expect(nodeIsEditable(nonSkill ?? null, true, editable)).toBe(false);
  });

  it('returns an empty set when the graph has no skill nodes', () => {
    const graph = {
      schemaVersion: 1,
      source: { id: 'memory:x', capabilities: { write: false, watch: false } },
      generatedBy: { adapter: 'test', version: '0' },
      nodes: [],
      edges: [],
      diagnostics: [],
    } as unknown as AgentGraph;
    expect(editableSkillPaths(graph, [])).toEqual(new Set());
  });
});
