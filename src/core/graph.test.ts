import { describe, expect, it } from 'vitest';
import { buildGraph, fileNodePaths, type GraphFragment, type PendingEdge } from './graph';
import type { RepoPath } from './paths';
import { AgentGraphSchema, type AgentNode, type SourceLocation } from './schema';

const HASH = 'a'.repeat(64);
const p = (value: string) => value as RepoPath;

function node(id: string, kind: AgentNode['kind'], path: string): AgentNode {
  return {
    id,
    kind,
    name: id,
    source: { path, contentHash: HASH, adapter: 'test' },
    attributes: {},
    diagnostics: [],
  };
}

function at(path: string, offset: number): SourceLocation {
  return {
    path,
    start: { offset, line: 1, column: offset + 1 },
    end: { offset: offset + 1, line: 1, column: offset + 2 },
    contentHash: HASH,
    adapter: 'test',
  };
}

function ref(
  source: string,
  raw: string,
  candidates: string[],
  offset: number,
  extra: Partial<PendingEdge> = {},
): PendingEdge {
  return {
    source,
    target: { kind: 'path', raw, candidates: candidates.map(p), onMissing: 'diagnose' },
    relation: 'references',
    evidence: 'explicit',
    provenance: at('A.md', offset),
    explanation: `link ${raw}`,
    ...extra,
  };
}

const FILES = ['A.md', 'B.md', 'docs/x.md', 'skill/scripts/run.sh', 'skill/SKILL.md'].map(p);

function fragments(): GraphFragment[] {
  return [
    {
      nodes: [node('a', 'instruction', 'A.md')],
      edges: [
        ref('a', 'B.md', ['B.md'], 1),
        ref('a', 'B.md', ['B.md'], 5),
        ref('a', 'B.md', ['B.md'], 5),
        ref('a', 'docs/x.md', ['docs/x.md'], 9),
        ref('a', 'skill/scripts/run.sh', ['skill/scripts/run.sh'], 12),
        ref('a', 'docs', ['docs'], 14),
        ref('a', 'missing.md', ['missing.md'], 20),
        ref('a', 'A.md', ['A.md'], 22, {
          evidence: 'inferred',
          target: { kind: 'path', raw: 'A.md', candidates: [p('A.md')], onMissing: 'ignore' },
        }),
        ref('a', 'skill', ['skill'], 24),
      ],
      diagnostics: [],
      owners: [{ path: p('A.md'), nodeId: 'a' }],
    },
    {
      nodes: [node('b', 'instruction', 'B.md'), node('s', 'skill', 'skill/SKILL.md')],
      edges: [
        { ...ref('b', 'A.md', ['A.md'], 3), provenance: at('B.md', 3) },
        {
          ...ref('b', 'gone', [], 4, {
            target: { kind: 'path', raw: '../gone', candidates: [], onMissing: 'diagnose' },
          }),
        },
        {
          ...ref('b', 'nope', ['nope'], 6, {
            target: { kind: 'path', raw: 'nope', candidates: [p('nope')], onMissing: 'ignore' },
          }),
        },
      ],
      diagnostics: [],
      owners: [
        { path: p('B.md'), nodeId: 'b' },
        { path: p('skill'), nodeId: 's' },
        { path: p('skill/SKILL.md'), nodeId: 's' },
      ],
    },
  ];
}

function build(input: GraphFragment[]) {
  return buildGraph({
    source: { id: 'memory:test', capabilities: { write: false, watch: false } },
    generatedBy: { adapter: 'test', version: '0' },
    files: FILES,
    fragments: input,
    hashes: new Map(fileNodePaths(FILES, input).map((path) => [path, HASH])),
  });
}

describe('buildGraph', () => {
  const graph = build(fragments());

  it('produces schema-valid output', () => {
    expect(() => AgentGraphSchema.parse(graph)).not.toThrow();
  });

  it('creates file, script, and directory nodes for resolved targets', () => {
    const kinds = Object.fromEntries(graph.nodes.map((n) => [n.id, n.kind]));
    expect(kinds['file:docs/x.md']).toBe('file');
    expect(kinds['script:skill/scripts/run.sh']).toBe('script');
    expect(kinds['directory:docs']).toBe('directory');
    expect(graph.nodes.find((n) => n.id === 'file:docs/x.md')?.source?.contentHash).toBe(HASH);
  });

  it('routes owned paths (skill folder) to their node', () => {
    expect(graph.edges.some((e) => e.source === 'a' && e.target === 's')).toBe(true);
  });

  it('keeps multi-edges with ordinals and removes exact duplicates', () => {
    const ab = graph.edges.filter((e) => e.source === 'a' && e.target === 'b');
    expect(ab.map((e) => e.id)).toEqual(['references:a->b#0', 'references:a->b#1']);
  });

  it('drops inferred self-references', () => {
    expect(graph.edges.some((e) => e.source === 'a' && e.target === 'a')).toBe(false);
  });

  it('diagnoses unresolved explicit references only', () => {
    const unresolved = graph.diagnostics.filter((d) => d.code === 'unresolved-reference');
    expect(unresolved.map((d) => d.message)).toEqual([
      'Reference target not found: ../gone',
      'Reference target not found: missing.md',
    ]);
    expect(graph.nodes.find((n) => n.id === 'a')?.diagnostics).toContain('unresolved-reference');
  });

  it('reports cycles as info diagnostics', () => {
    const cycles = graph.diagnostics.filter((d) => d.code === 'reference-cycle');
    expect(cycles).toHaveLength(1);
    expect(cycles[0]?.severity).toBe('info');
    expect(cycles[0]?.message).toContain('a, b');
  });

  it('is deterministic regardless of fragment order', () => {
    expect(build(fragments().reverse())).toEqual(graph);
  });

  it('diagnoses ambiguous candidates when asked', () => {
    const ambiguous = build([
      {
        nodes: [node('r', 'rule', 'A.md')],
        edges: [
          {
            ...ref('r', 'x.md', [], 0),
            target: {
              kind: 'path',
              raw: 'B.md',
              candidates: [p('B.md'), p('docs/x.md')],
              onMissing: 'diagnose',
              diagnoseAmbiguity: true,
            },
          },
        ],
        diagnostics: [],
        owners: [],
      },
    ]);
    expect(ambiguous.diagnostics.map((d) => d.code)).toContain('ambiguous-reference');
    expect(ambiguous.edges[0]?.target).toBe('file:B.md');
  });
});
