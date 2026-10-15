import type { AgentEdge } from '../core';

/** Stable human-facing kinds for inspector / legend (derived from relation + explanation). */
export type EdgeLabelKind =
  | 'markdown-link'
  | 'mention'
  | 'inferred-backtick'
  | 'contains'
  | 'glob-apply'
  | 'applies-scope'
  | 'other';

const LABELS: Record<EdgeLabelKind, string> = {
  'markdown-link': 'Markdown link',
  mention: '@mention',
  'inferred-backtick': 'Inferred backtick path',
  contains: 'Contains (folder)',
  'glob-apply': 'Glob / paths apply',
  'applies-scope': 'Applies to scope',
  other: 'Reference',
};

export function classifyEdge(edge: AgentEdge): EdgeLabelKind {
  if (edge.relation === 'contains') return 'contains';
  if (edge.explanation.includes('matches discovered path')) return 'glob-apply';
  if (edge.explanation.startsWith('Markdown ')) return 'markdown-link';
  if (edge.explanation.includes('@-mention') || edge.explanation.includes('Rule @-mention')) {
    return 'mention';
  }
  if (edge.evidence === 'inferred' || edge.explanation.startsWith('Inline code ')) {
    return 'inferred-backtick';
  }
  if (edge.relation === 'applies-to') return 'applies-scope';
  return 'other';
}

/** Short label for inspector list and edge tooltips. */
export function edgeLabel(edge: AgentEdge): string {
  return LABELS[classifyEdge(edge)];
}

export const EDGE_LABEL_LEGEND: { kind: EdgeLabelKind; label: string; hint: string }[] = [
  { kind: 'markdown-link', label: LABELS['markdown-link'], hint: 'Explicit MD link / image / def' },
  { kind: 'mention', label: LABELS.mention, hint: 'Rule @path mention' },
  {
    kind: 'inferred-backtick',
    label: LABELS['inferred-backtick'],
    hint: 'Inline code that resolves to a file',
  },
  { kind: 'contains', label: LABELS.contains, hint: 'Derived folder membership' },
  {
    kind: 'glob-apply',
    label: LABELS['glob-apply'],
    hint: 'Rule globs or skill paths match',
  },
  {
    kind: 'applies-scope',
    label: LABELS['applies-scope'],
    hint: 'AGENTS.md or nested skill scope',
  },
];
