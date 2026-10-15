import type { RepoPath } from './paths';
import type { NodeKind, Relation } from './schema';

/** `skill:.cursor/skills/add-test`, `mcp-server:.cursor/mcp.json#name` */
export function nodeId(kind: NodeKind, path: RepoPath, fragment?: string): string {
  return fragment === undefined ? `${kind}:${path}` : `${kind}:${path}#${fragment}`;
}

/** `${relation}:${source}->${target}#${ordinal}`; ordinal disambiguates multi-edges. */
export function edgeId(
  relation: Relation,
  source: string,
  target: string,
  ordinal: number,
): string {
  return `${relation}:${source}->${target}#${ordinal}`;
}
