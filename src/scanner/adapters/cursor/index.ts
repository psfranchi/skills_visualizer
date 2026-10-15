import { type GraphDiagnostic, type GraphFragment, ROOT_DIR } from '../../../core';
import type { ClientAdapter, Discovered, LoadedFile } from '../../adapter';
import { classifyCursorPaths } from './classify';
import { globApplyFragment } from './glob-edges';
import { ADAPTER_ID, parseAgent, parseInstruction, parseRule, parseSkill } from './markdown-kinds';
import { parseMcpConfig } from './mcp';

export { redactMcpConfigText } from './mcp';

/** `.cursor` wins agent name conflicts. */
const AGENT_ROOT_PRECEDENCE = ['.cursor', '.claude', '.codex'];

function parse(d: Discovered, file: LoadedFile): GraphFragment {
  switch (d.kind) {
    case 'instruction':
      return parseInstruction(d, file);
    case 'rule':
      return parseRule(d, file);
    case 'skill':
      return parseSkill(d, file);
    case 'agent':
      return parseAgent(d, file);
    case 'mcp-config':
      return parseMcpConfig(d, file);
  }
}

/** Repo-level agents sharing a name across roots: every loser gets an `agent-shadowed` diagnostic. */
export function agentShadowing(fragments: readonly GraphFragment[]): GraphDiagnostic[] {
  const byName = new Map<string, { id: string; root: string; path: string }[]>();
  for (const node of fragments.flatMap((f) => f.nodes)) {
    if (node.kind !== 'agent' || node.attributes.scope !== ROOT_DIR) continue;
    const entry = {
      id: node.id,
      root: String(node.attributes.root),
      path: String(node.attributes.path),
    };
    byName.set(node.name, [...(byName.get(node.name) ?? []), entry]);
  }
  const diagnostics: GraphDiagnostic[] = [];
  for (const [name, agents] of byName) {
    if (agents.length < 2) continue;
    const ranked = [...agents].sort(
      (a, b) =>
        AGENT_ROOT_PRECEDENCE.indexOf(a.root) - AGENT_ROOT_PRECEDENCE.indexOf(b.root) ||
        (a.path < b.path ? -1 : 1),
    );
    const [winner, ...losers] = ranked;
    for (const loser of losers) {
      diagnostics.push({
        code: 'agent-shadowed',
        message: `Agent "${name}" is shadowed by ${winner?.id} (${winner?.root} wins name conflicts).`,
        severity: 'warning',
        path: loser.path,
        nodeId: loser.id,
      });
    }
  }
  return diagnostics;
}

export const cursorAdapter: ClientAdapter = {
  id: ADAPTER_ID,
  version: '0.1.0',
  classify: classifyCursorPaths,
  parse,
  finalize: agentShadowing,
  enrich: globApplyFragment,
  editable: (d) => d.kind === 'skill',
};
