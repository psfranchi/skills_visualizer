import { type GraphDiagnostic, type GraphFragment, ROOT_DIR } from '../core';
import { ROOT_PRECEDENCE } from './engine';

type Named = { id: string; root: string; path: string; engine: string };

function collect(
  fragments: readonly GraphFragment[],
  kind: 'agent' | 'skill',
): Map<string, Named[]> {
  const byName = new Map<string, Named[]>();
  for (const node of fragments.flatMap((f) => f.nodes)) {
    if (node.kind !== kind || node.attributes.scope !== ROOT_DIR) continue;
    const entry: Named = {
      id: node.id,
      root: String(node.attributes.root ?? ''),
      path: String(node.attributes.path ?? ''),
      engine: String(node.attributes.engine ?? 'shared'),
    };
    byName.set(node.name, [...(byName.get(node.name) ?? []), entry]);
  }
  return byName;
}

function shadowDiagnostics(
  byName: Map<string, Named[]>,
  kind: 'agent' | 'skill',
  code: string,
): GraphDiagnostic[] {
  const diagnostics: GraphDiagnostic[] = [];
  for (const [name, items] of byName) {
    if (items.length < 2) continue;
    const ranked = [...items].sort(
      (a, b) =>
        ROOT_PRECEDENCE.indexOf(a.root as (typeof ROOT_PRECEDENCE)[number]) -
          ROOT_PRECEDENCE.indexOf(b.root as (typeof ROOT_PRECEDENCE)[number]) ||
        (a.path < b.path ? -1 : 1),
    );
    const [winner, ...losers] = ranked;
    for (const loser of losers) {
      diagnostics.push({
        code,
        message: `${kind === 'agent' ? 'Agent' : 'Skill'} "${name}" (${loser.engine}) is shadowed by ${winner?.id} (${winner?.engine}; ${winner?.root || 'unknown'} wins name conflicts).`,
        severity: 'warning',
        path: loser.path,
        nodeId: loser.id,
      });
    }
  }
  return diagnostics;
}

/** Cross-engine / cross-root name collisions for agents and skills. */
export function nameShadowing(fragments: readonly GraphFragment[]): GraphDiagnostic[] {
  return [
    ...shadowDiagnostics(collect(fragments, 'agent'), 'agent', 'agent-shadowed'),
    ...shadowDiagnostics(collect(fragments, 'skill'), 'skill', 'skill-shadowed'),
  ];
}
