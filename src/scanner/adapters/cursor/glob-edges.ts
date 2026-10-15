import type {
  AgentNode,
  GraphDiagnostic,
  GraphFragment,
  PendingEdge,
  RepoPath,
} from '../../../core';
import { MAX_GLOB_MATCHES, matchDiscoveredPaths } from '../../glob-match';

function listPatterns(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((g): g is string => typeof g === 'string' && g.trim() !== '');
  return [];
}

/** Rule `globs` or skill `paths` (legacy `globs`) from node attributes. */
export function applyPatterns(node: AgentNode): string[] {
  if (node.kind === 'rule') return listPatterns(node.attributes.globs);
  if (node.kind === 'skill') {
    const paths = listPatterns(node.attributes.paths);
    return paths.length > 0 ? paths : listPatterns(node.attributes.globs);
  }
  return [];
}

function sourcePath(node: AgentNode): string | undefined {
  const path = node.attributes.path;
  return typeof path === 'string' ? path : undefined;
}

/**
 * Derived `applies-to` edges from rule globs / skill paths to matching discovered files.
 * Caps fan-out; emits diagnostics when a pattern matches nothing or hits the cap.
 */
export function globApplyFragment(
  fragments: readonly GraphFragment[],
  files: readonly RepoPath[],
): GraphFragment {
  const edges: PendingEdge[] = [];
  const diagnostics: GraphDiagnostic[] = [];
  const byPath = new Map(files.map((p) => [p as string, p]));

  for (const node of fragments.flatMap((f) => f.nodes)) {
    const patterns = applyPatterns(node);
    if (patterns.length === 0) continue;
    const path = sourcePath(node);

    for (const pattern of [...patterns].sort()) {
      const { matches, capped } = matchDiscoveredPaths(pattern, [...byPath.keys()]);
      if (matches.length === 0) {
        diagnostics.push({
          code: 'glob-no-match',
          message: `Glob "${pattern}" matches no discovered files.`,
          severity: 'info',
          nodeId: node.id,
          ...(path ? { path } : {}),
        });
        continue;
      }
      if (capped) {
        diagnostics.push({
          code: 'glob-match-capped',
          message: `Glob "${pattern}" matched more than ${MAX_GLOB_MATCHES} discovered files; showing the first ${MAX_GLOB_MATCHES}.`,
          severity: 'info',
          nodeId: node.id,
          ...(path ? { path } : {}),
        });
      }
      const label = node.kind === 'rule' ? 'Rule glob' : 'Skill paths';
      for (const match of matches) {
        // Skip the config file itself when a glob is overly broad.
        if (path && match === path) continue;
        const repoPath = byPath.get(match);
        if (!repoPath) continue;
        edges.push({
          source: node.id,
          target: {
            kind: 'path',
            raw: pattern,
            candidates: [repoPath],
            onMissing: 'ignore',
            allowDirectories: false,
          },
          relation: 'applies-to',
          evidence: 'derived',
          explanation: `${label} "${pattern}" matches discovered path`,
        });
      }
    }
  }

  return { nodes: [], edges, diagnostics, owners: [] };
}
