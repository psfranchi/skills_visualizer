import type { AgentGraph } from './schema';

/** `local:/abs/path/repo` → `local:repo`; other ids are already non-identifying. */
export function publicSourceId(id: string): string {
  if (!id.startsWith('local:')) return id;
  const segments = id.slice('local:'.length).split(/[\\/]/).filter(Boolean);
  return `local:${segments.at(-1) ?? 'root'}`;
}

/** The graph as it may leave the machine's trust boundary (API responses, CLI output). */
export function publicGraph(graph: AgentGraph): AgentGraph {
  return { ...graph, source: { ...graph.source, id: publicSourceId(graph.source.id) } };
}
