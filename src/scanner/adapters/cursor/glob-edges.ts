import type {
  AgentNode,
  GraphDiagnostic,
  GraphFragment,
  PendingEdge,
  RepoPath,
} from '../../../core';
import {
  limitPatterns,
  MAX_GLOB_EDGES_TOTAL,
  MAX_GLOB_MATCHES,
  MAX_PATTERN_LENGTH,
  MAX_PATTERNS_PER_NODE,
  matchDiscoveredPaths,
} from '../../glob-match';

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

function warn(
  node: AgentNode,
  path: string | undefined,
  code: string,
  message: string,
): GraphDiagnostic {
  return {
    code,
    message,
    severity: 'warning',
    nodeId: node.id,
    ...(path ? { path } : {}),
  };
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
  /** One sorted list reused for every pattern (stable caps, no per-pattern re-sort). */
  const sortedPaths = [...byPath.keys()].sort();
  let budgetHit = false;

  for (const node of fragments.flatMap((f) => f.nodes)) {
    const raw = applyPatterns(node);
    if (raw.length === 0) continue;
    const path = sourcePath(node);
    const { patterns, skippedTooLong, cappedCount } = limitPatterns(raw);

    if (skippedTooLong > 0) {
      diagnostics.push(
        warn(
          node,
          path,
          'glob-pattern-too-long',
          `Skipped ${skippedTooLong} glob pattern(s) longer than ${MAX_PATTERN_LENGTH} characters.`,
        ),
      );
    }
    if (cappedCount) {
      diagnostics.push(
        warn(
          node,
          path,
          'glob-patterns-capped',
          `Only the first ${MAX_PATTERNS_PER_NODE} glob patterns are applied (sorted).`,
        ),
      );
    }

    for (const pattern of patterns) {
      if (edges.length >= MAX_GLOB_EDGES_TOTAL) {
        if (!budgetHit) {
          budgetHit = true;
          diagnostics.push({
            code: 'glob-edges-budget',
            message: `Stopped after ${MAX_GLOB_EDGES_TOTAL} glob/paths match edges in this scan.`,
            severity: 'warning',
          });
        }
        break;
      }

      const { matches, capped } = matchDiscoveredPaths(pattern, sortedPaths);
      if (matches.length === 0) {
        diagnostics.push(
          warn(node, path, 'glob-no-match', `Glob "${pattern}" matches no discovered files.`),
        );
        continue;
      }
      if (capped) {
        diagnostics.push(
          warn(
            node,
            path,
            'glob-match-capped',
            `Glob "${pattern}" matched more than ${MAX_GLOB_MATCHES} discovered files; showing the first ${MAX_GLOB_MATCHES}.`,
          ),
        );
      }

      const label = node.kind === 'rule' ? 'Rule glob' : 'Skill paths';
      let emitted = 0;
      for (const match of matches) {
        if (edges.length >= MAX_GLOB_EDGES_TOTAL) {
          if (!budgetHit) {
            budgetHit = true;
            diagnostics.push({
              code: 'glob-edges-budget',
              message: `Stopped after ${MAX_GLOB_EDGES_TOTAL} glob/paths match edges in this scan.`,
              severity: 'warning',
            });
          }
          break;
        }
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
          linkKind: 'glob-apply',
          explanation: `${label} "${pattern}" matches discovered path`,
        });
        emitted++;
      }

      if (emitted === 0) {
        diagnostics.push(
          warn(
            node,
            path,
            'glob-no-match',
            `Glob "${pattern}" matches no discovered files after excluding the config file itself.`,
          ),
        );
      }
    }
  }

  return { nodes: [], edges, diagnostics, owners: [] };
}
