import type { AgentGraph, AgentNode, RepoPath } from '../core';
import type { ClientAdapter } from '../scanner/adapter';
import { multiEngineAdapter } from '../scanner/adapters/multi';

/** Skill nodes whose source path the adapter marks editable (discovered SKILL.md only). */
export function editableSkillPaths(
  graph: AgentGraph,
  allPaths: readonly RepoPath[],
  adapter: ClientAdapter = multiEngineAdapter,
): Set<RepoPath> {
  const { discovered } = adapter.classify(allPaths);
  const editable = new Set(
    discovered.filter((d) => adapter.editable(d)).map((d) => d.path as RepoPath),
  );
  const paths: RepoPath[] = [];
  for (const n of graph.nodes) {
    if (n.kind === 'skill' && n.source && editable.has(n.source.path as RepoPath)) {
      paths.push(n.source.path as RepoPath);
    }
  }
  return new Set(paths);
}

export function isEditableSkill(
  graph: AgentGraph,
  path: RepoPath,
  allPaths: readonly RepoPath[],
  adapter: ClientAdapter = multiEngineAdapter,
): boolean {
  return editableSkillPaths(graph, allPaths, adapter).has(path);
}

/** UI helper: a node is editable when write is on and it is a skill with an editable path. */
export function nodeIsEditable(
  node: AgentNode | null,
  write: boolean,
  editablePaths: ReadonlySet<string>,
): boolean {
  return (
    write &&
    node !== null &&
    node.kind === 'skill' &&
    node.source !== undefined &&
    editablePaths.has(node.source.path)
  );
}
