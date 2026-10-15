import type { AgentGraph } from '../core';

export interface EdgeImpact {
  edgesAdded: string[];
  edgesRemoved: string[];
}

/** Compare edge id sets between two graphs (typically before vs after a planned edit). */
export function edgeImpact(before: AgentGraph, after: AgentGraph): EdgeImpact {
  const previous = new Set(before.edges.map((e) => e.id));
  const next = new Set(after.edges.map((e) => e.id));
  return {
    edgesAdded: [...next].filter((id) => !previous.has(id)).sort(),
    edgesRemoved: [...previous].filter((id) => !next.has(id)).sort(),
  };
}
