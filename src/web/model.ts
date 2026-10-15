import {
  type AgentEdge,
  type AgentGraph,
  type AgentNode,
  type GraphDiagnostic,
  NODE_KINDS,
  type NodeKind,
  type Severity,
} from '../core';

export interface Filters {
  search: string;
  kinds: ReadonlySet<NodeKind>;
  showInferred: boolean;
  /** Diagnostic severities to show; `info` is hidden by default. */
  severities: ReadonlySet<Severity>;
}

export function defaultFilters(): Filters {
  return {
    search: '',
    kinds: new Set(NODE_KINDS),
    showInferred: false,
    severities: new Set<Severity>(['warning', 'error']),
  };
}

export interface VisibleGraph {
  nodeIds: ReadonlySet<string>;
  edgeIds: ReadonlySet<string>;
}

/** Only these kinds may be hidden with inferred edges; config nodes always show. */
const INFERRED_HIDEABLE_KINDS: ReadonlySet<NodeKind> = new Set(['file', 'script']);

/** `file`/`script` nodes that have edges and all of them are inferred. */
export function inferredOnlyNodeIds(graph: AgentGraph): Set<string> {
  const hasInferred = new Set<string>();
  const hasOther = new Set<string>();
  for (const e of graph.edges) {
    const bucket = e.evidence === 'inferred' ? hasInferred : hasOther;
    bucket.add(e.source);
    bucket.add(e.target);
  }
  return new Set(
    graph.nodes
      .filter(
        (n) => INFERRED_HIDEABLE_KINDS.has(n.kind) && hasInferred.has(n.id) && !hasOther.has(n.id),
      )
      .map((n) => n.id),
  );
}

/** Kind filter and the inferred-edge toggle. Search does not hide nodes (see `searchMatches`). */
export function visibleGraph(graph: AgentGraph, filters: Filters): VisibleGraph {
  const hidden = filters.showInferred ? new Set<string>() : inferredOnlyNodeIds(graph);
  const nodeIds = new Set(
    graph.nodes.filter((n) => filters.kinds.has(n.kind) && !hidden.has(n.id)).map((n) => n.id),
  );
  const edgeIds = new Set(
    graph.edges
      .filter(
        (e) =>
          (filters.showInferred || e.evidence !== 'inferred') &&
          nodeIds.has(e.source) &&
          nodeIds.has(e.target),
      )
      .map((e) => e.id),
  );
  return { nodeIds, edgeIds };
}

/** Case-insensitive match on name, id, and source path; null when the query is blank. */
export function searchMatches(nodes: readonly AgentNode[], query: string): Set<string> | null {
  const needle = query.trim().toLowerCase();
  if (needle === '') return null;
  return new Set(
    nodes
      .filter((n) =>
        [n.name, n.id, n.source?.path ?? ''].some((v) => v.toLowerCase().includes(needle)),
      )
      .map((n) => n.id),
  );
}

/** Nodes for the list: visible, matching the search, sorted by kind order then name. */
export function listedNodes(
  graph: AgentGraph,
  visible: VisibleGraph,
  matches: ReadonlySet<string> | null,
): AgentNode[] {
  return graph.nodes
    .filter((n) => visible.nodeIds.has(n.id) && (!matches || matches.has(n.id)))
    .sort(
      (a, b) =>
        NODE_KINDS.indexOf(a.kind) - NODE_KINDS.indexOf(b.kind) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
}

/** Next/previous id for keyboard navigation; clamps at both ends. */
export function stepSelection(
  ids: readonly string[],
  current: string | null,
  key: 'ArrowDown' | 'ArrowUp' | 'Home' | 'End',
): string | null {
  if (ids.length === 0) return null;
  const last = ids.length - 1;
  if (key === 'Home') return ids[0] ?? null;
  if (key === 'End') return ids[last] ?? null;
  const index = current === null ? -1 : ids.indexOf(current);
  if (index === -1) return key === 'ArrowDown' ? (ids[0] ?? null) : (ids[last] ?? null);
  const next = key === 'ArrowDown' ? Math.min(last, index + 1) : Math.max(0, index - 1);
  return ids[next] ?? null;
}

export function diagnosticsForNode(
  graph: AgentGraph,
  node: AgentNode,
  severities: ReadonlySet<Severity>,
): GraphDiagnostic[] {
  return graph.diagnostics.filter(
    (d) =>
      severities.has(d.severity) &&
      (d.nodeId === node.id ||
        (d.nodeId === undefined && d.path !== undefined && d.path === node.source?.path)),
  );
}

export function filterDiagnostics(
  diagnostics: readonly GraphDiagnostic[],
  severities: ReadonlySet<Severity>,
): GraphDiagnostic[] {
  return diagnostics.filter((d) => severities.has(d.severity));
}

const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, error: 2 };

/** Worst visible severity per node id. */
export function nodeSeverities(
  graph: AgentGraph,
  severities: ReadonlySet<Severity>,
): Map<string, Severity> {
  const byPath = new Map<string, string>();
  for (const node of graph.nodes) {
    if (node.source && !byPath.has(node.source.path)) byPath.set(node.source.path, node.id);
  }
  const worst = new Map<string, Severity>();
  for (const d of filterDiagnostics(graph.diagnostics, severities)) {
    const id = d.nodeId ?? (d.path === undefined ? undefined : byPath.get(d.path));
    if (id === undefined) continue;
    const current = worst.get(id);
    if (!current || SEVERITY_RANK[d.severity] > SEVERITY_RANK[current]) worst.set(id, d.severity);
  }
  return worst;
}

export function incidentEdges(
  graph: AgentGraph,
  id: string,
  visibleEdgeIds: ReadonlySet<string> | null,
): { incoming: AgentEdge[]; outgoing: AgentEdge[] } {
  const shown = (e: AgentEdge) => !visibleEdgeIds || visibleEdgeIds.has(e.id);
  return {
    incoming: graph.edges.filter((e) => e.target === id && shown(e)),
    outgoing: graph.edges.filter((e) => e.source === id && shown(e)),
  };
}

/** Only `http:` / `https:` URLs become links; everything else renders as text. */
export function safeHref(value: string): string | null {
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export interface HighlightParts {
  before: string;
  match: string;
  after: string;
}

/** Splits `text` around `[start, end)` (clamped); null when there is no usable range. */
export function splitHighlight(
  text: string,
  start: number | undefined,
  end: number | undefined,
): HighlightParts | null {
  if (start === undefined) return null;
  const from = Math.max(0, Math.min(text.length, start));
  const to = Math.max(from, Math.min(text.length, end ?? start));
  if (to === from) return null;
  return { before: text.slice(0, from), match: text.slice(from, to), after: text.slice(to) };
}
