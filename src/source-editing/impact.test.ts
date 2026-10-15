import { describe, expect, it } from 'vitest';
import type { AgentGraph } from '../core';
import { edgeImpact } from './impact';

function graph(edgeIds: string[]): AgentGraph {
  return {
    schemaVersion: 1,
    source: { id: 'memory:t', capabilities: { write: false, watch: false } },
    generatedBy: { adapter: 'cursor', version: '0' },
    nodes: [],
    edges: edgeIds.map((id) => ({
      id,
      source: 'a',
      target: 'b',
      relation: 'references' as const,
      evidence: 'explicit' as const,
      explanation: id,
      supportedOperations: [],
    })),
    diagnostics: [],
  };
}

describe('edgeImpact', () => {
  it('lists added and removed edge ids', () => {
    expect(edgeImpact(graph(['e1', 'e2']), graph(['e2', 'e3']))).toEqual({
      edgesAdded: ['e3'],
      edgesRemoved: ['e1'],
    });
  });
});
