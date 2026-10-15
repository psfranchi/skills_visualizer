import { describe, expect, it } from 'vitest';
import type { AgentEdge, AgentGraph, AgentNode, GraphDiagnostic, NodeKind } from '../core';
import {
  defaultFilters,
  diagnosticsForNode,
  focusNeighborhood,
  incidentEdges,
  inferredOnlyNodeIds,
  listedNodes,
  nodeSeverities,
  pathToNearestInstruction,
  safeHref,
  searchMatches,
  sourceDisplay,
  splitHighlight,
  stepSelection,
  visibleGraph,
} from './model';

const HASH = 'a'.repeat(64);

function node(id: string, kind: NodeKind, name: string, path?: string): AgentNode {
  return {
    id,
    kind,
    name,
    attributes: {},
    diagnostics: [],
    ...(path ? { source: { path, contentHash: HASH, adapter: 'cursor' } } : {}),
  };
}

function edge(id: string, source: string, target: string, evidence: AgentEdge['evidence']) {
  return {
    id,
    source,
    target,
    relation: 'references' as const,
    evidence,
    explanation: id,
    supportedOperations: [],
  };
}

const diagnostics: GraphDiagnostic[] = [
  { code: 'i', message: 'info', severity: 'info', nodeId: 'skill:a' },
  { code: 'w', message: 'warn', severity: 'warning', path: '.cursor/rules/r.mdc' },
  { code: 'e', message: 'err', severity: 'error', nodeId: 'skill:a' },
];

const graph: AgentGraph = {
  schemaVersion: 1,
  source: { id: 'memory:test', capabilities: { write: false, watch: false } },
  generatedBy: { adapter: 'cursor', version: '0' },
  nodes: [
    node('skill:a', 'skill', 'alpha', '.cursor/skills/a/SKILL.md'),
    node('rule:r', 'rule', 'Rules', '.cursor/rules/r.mdc'),
    node('file:docs/x.md', 'file', 'x.md', 'docs/x.md'),
    node('directory:docs', 'directory', 'docs'),
  ],
  edges: [
    edge('e1', 'skill:a', 'file:docs/x.md', 'explicit'),
    edge('e2', 'rule:r', 'file:docs/x.md', 'inferred'),
    edge('e3', 'file:docs/x.md', 'directory:docs', 'derived'),
  ],
  diagnostics,
};

describe('visibleGraph', () => {
  it('hides inferred edges by default and drops edges to hidden kinds', () => {
    const visible = visibleGraph(graph, defaultFilters());
    expect([...visible.nodeIds]).toHaveLength(4);
    expect([...visible.edgeIds].sort()).toEqual(['e1', 'e3']);

    const filters = { ...defaultFilters(), showInferred: true, kinds: new Set<NodeKind>(['rule']) };
    const narrowed = visibleGraph(graph, { ...filters, kinds: new Set(['rule', 'file']) });
    expect([...narrowed.nodeIds].sort()).toEqual(['file:docs/x.md', 'rule:r']);
    expect([...narrowed.edgeIds]).toEqual(['e2']);
  });

  it('hides file/script nodes reached only by inferred edges unless inferred edges are shown', () => {
    const inferredGraph: AgentGraph = {
      ...graph,
      nodes: [
        ...graph.nodes,
        node('file:docs/y.md', 'file', 'y.md', 'docs/y.md'),
        node('script:run.sh', 'script', 'run.sh', 'run.sh'),
        node('skill:b', 'skill', 'beta', '.cursor/skills/b/SKILL.md'),
        node('file:lonely.md', 'file', 'lonely.md', 'lonely.md'),
      ],
      edges: [
        ...graph.edges,
        edge('i1', 'rule:r', 'file:docs/y.md', 'inferred'),
        edge('i2', 'skill:a', 'script:run.sh', 'inferred'),
        edge('i3', 'skill:b', 'skill:a', 'inferred'),
      ],
    };
    expect([...inferredOnlyNodeIds(inferredGraph)].sort()).toEqual([
      'file:docs/y.md',
      'script:run.sh',
    ]);

    const hidden = visibleGraph(inferredGraph, defaultFilters());
    expect(hidden.nodeIds.has('file:docs/y.md')).toBe(false);
    expect(hidden.nodeIds.has('script:run.sh')).toBe(false);
    expect(hidden.nodeIds.has('file:docs/x.md')).toBe(true);
    expect(hidden.nodeIds.has('skill:b')).toBe(true);
    expect(hidden.nodeIds.has('file:lonely.md')).toBe(true);

    const shown = visibleGraph(inferredGraph, { ...defaultFilters(), showInferred: true });
    expect(shown.nodeIds.size).toBe(inferredGraph.nodes.length);
    expect(shown.edgeIds.has('i1')).toBe(true);
  });
});

describe('search and listing', () => {
  it('matches name, id, or path case-insensitively; blank means no filter', () => {
    expect(searchMatches(graph.nodes, '  ')).toBeNull();
    expect([...(searchMatches(graph.nodes, 'ALPHA') ?? [])]).toEqual(['skill:a']);
    expect([...(searchMatches(graph.nodes, 'docs') ?? [])].sort()).toEqual([
      'directory:docs',
      'file:docs/x.md',
    ]);
  });

  it('lists visible matches in kind order', () => {
    const visible = visibleGraph(graph, defaultFilters());
    expect(listedNodes(graph, visible, null).map((n) => n.id)).toEqual([
      'rule:r',
      'skill:a',
      'file:docs/x.md',
      'directory:docs',
    ]);
    expect(listedNodes(graph, visible, new Set(['skill:a'])).map((n) => n.id)).toEqual(['skill:a']);
  });

  it('steps selection with arrow keys, clamping at the ends', () => {
    const ids = ['a', 'b', 'c'];
    expect(stepSelection(ids, null, 'ArrowDown')).toBe('a');
    expect(stepSelection(ids, null, 'ArrowUp')).toBe('c');
    expect(stepSelection(ids, 'a', 'ArrowDown')).toBe('b');
    expect(stepSelection(ids, 'c', 'ArrowDown')).toBe('c');
    expect(stepSelection(ids, 'a', 'ArrowUp')).toBe('a');
    expect(stepSelection(ids, 'b', 'End')).toBe('c');
    expect(stepSelection(ids, 'b', 'Home')).toBe('a');
    expect(stepSelection([], 'a', 'ArrowDown')).toBeNull();
  });
});

describe('diagnostics', () => {
  it('filters by severity (info hidden by default) and matches by node id or path', () => {
    const { severities } = defaultFilters();
    const [skill, rule] = graph.nodes;
    if (!skill || !rule) throw new Error('fixture');
    expect(diagnosticsForNode(graph, skill, severities).map((d) => d.code)).toEqual(['e']);
    expect(diagnosticsForNode(graph, rule, severities).map((d) => d.code)).toEqual(['w']);
    expect(diagnosticsForNode(graph, skill, new Set(['info'])).map((d) => d.code)).toEqual(['i']);
  });

  it('computes the worst visible severity per node', () => {
    const worst = nodeSeverities(graph, defaultFilters().severities);
    expect(worst.get('skill:a')).toBe('error');
    expect(worst.get('rule:r')).toBe('warning');
    expect(nodeSeverities(graph, new Set(['info'])).get('skill:a')).toBe('info');
  });
});

describe('incidentEdges', () => {
  it('splits incoming and outgoing, honoring the visible edge set', () => {
    const all = incidentEdges(graph, 'file:docs/x.md', null);
    expect(all.incoming.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(all.outgoing.map((e) => e.id)).toEqual(['e3']);
    const visible = incidentEdges(graph, 'file:docs/x.md', new Set(['e1', 'e3']));
    expect(visible.incoming.map((e) => e.id)).toEqual(['e1']);
  });
});

describe('focusNeighborhood', () => {
  it('returns null when focus is off or nothing is selected', () => {
    const edges = new Set(graph.edges.map((e) => e.id));
    expect(focusNeighborhood(graph, null, edges, true)).toBeNull();
    expect(focusNeighborhood(graph, 'skill:a', edges, false)).toBeNull();
  });

  it('includes the selection and its visible neighbors', () => {
    const ids = focusNeighborhood(graph, 'skill:a', new Set(['e1', 'e3']), true);
    expect([...(ids ?? [])].sort()).toEqual(['file:docs/x.md', 'skill:a']);
  });
});

describe('pathToNearestInstruction', () => {
  it('finds a short path over visible edges', () => {
    const withInstruction: AgentGraph = {
      ...graph,
      nodes: [...graph.nodes, node('instruction:root', 'instruction', 'AGENTS.md', 'AGENTS.md')],
      edges: [
        ...graph.edges,
        {
          id: 'e4',
          source: 'instruction:root',
          target: 'directory:docs',
          relation: 'applies-to',
          evidence: 'derived',
          explanation: 'scope',
          supportedOperations: [],
        },
      ],
    };
    const path = pathToNearestInstruction(withInstruction, 'file:docs/x.md', new Set(['e3', 'e4']));
    expect(path).toEqual(['file:docs/x.md', 'directory:docs', 'instruction:root']);
  });
});

describe('safeHref', () => {
  it.each([
    ['https://example.com/a?b', 'https://example.com/a?b'],
    ['HTTP://example.com', 'http://example.com/'],
  ])('allows %s', (value, expected) => {
    expect(safeHref(value)).toBe(expected);
  });

  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,x',
    'vbscript:x',
    'file:///etc/passwd',
    '//evil.example.com',
    'docs/a.md',
    'http://',
  ])('rejects %s', (value) => {
    expect(safeHref(value)).toBeNull();
  });
});

describe('splitHighlight', () => {
  it('splits around a clamped range', () => {
    expect(splitHighlight('abcdef', 1, 3)).toEqual({ before: 'a', match: 'bc', after: 'def' });
    expect(splitHighlight('abc', 2, 99)).toEqual({ before: 'ab', match: 'c', after: '' });
  });

  it('returns null without a usable range', () => {
    expect(splitHighlight('abc', undefined, 2)).toBeNull();
    expect(splitHighlight('abc', 1, 1)).toBeNull();
    expect(splitHighlight('abc', 5, 9)).toBeNull();
  });
});

describe('sourceDisplay', () => {
  const focus = {
    path: 'a.md',
    start: { offset: 1, line: 1, column: 2 },
    end: { offset: 3, line: 1, column: 4 },
    contentHash: HASH,
    adapter: 'cursor',
  };

  it('highlights only when the served bytes match the scanned hash', () => {
    expect(sourceDisplay({ text: 'abcdef', hash: HASH, redacted: false }, focus)).toEqual({
      kind: 'highlight',
      parts: { before: 'a', match: 'bc', after: 'def' },
    });
    expect(
      sourceDisplay({ text: 'xabcdef', hash: 'b'.repeat(64), redacted: false }, focus),
    ).toEqual({ kind: 'stale' });
  });

  it('never highlights redacted text, and reports staleness first', () => {
    expect(sourceDisplay({ text: '{}', hash: HASH, redacted: true }, focus)).toEqual({
      kind: 'redacted',
    });
    expect(sourceDisplay({ text: '{}', hash: 'b'.repeat(64), redacted: true }, focus)).toEqual({
      kind: 'stale',
    });
  });
});
