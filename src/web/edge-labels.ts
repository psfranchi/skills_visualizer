import { type AgentEdge, LINK_KINDS, type LinkKind } from '../core';

/** Human-facing kinds for inspector / legend (mapped from scanner `linkKind`). */
export type EdgeLabelKind = LinkKind;

const LABELS: Record<LinkKind, string> = {
  'markdown-link': 'Markdown link',
  mention: '@mention',
  'inferred-backtick': 'Inferred backtick path',
  contains: 'Contains (folder)',
  'glob-apply': 'Glob / paths apply',
  'applies-scope': 'Applies to scope',
  other: 'Reference',
};

export function classifyEdge(edge: AgentEdge): EdgeLabelKind {
  if (edge.linkKind && (LINK_KINDS as readonly string[]).includes(edge.linkKind)) {
    return edge.linkKind;
  }
  // Legacy / test edges without a tag: relation-only fallback (never parse explanation).
  if (edge.relation === 'contains') return 'contains';
  if (edge.relation === 'applies-to') return 'applies-scope';
  if (edge.evidence === 'inferred') return 'inferred-backtick';
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
