import { describe, expect, it } from 'vitest';
import type { AgentEdge } from '../core';
import { classifyEdge, edgeLabel } from './edge-labels';

function edge(
  partial: Partial<AgentEdge> & Pick<AgentEdge, 'explanation' | 'relation'>,
): AgentEdge {
  return {
    id: 'e',
    source: 'a',
    target: 'b',
    evidence: 'explicit',
    supportedOperations: [],
    ...partial,
  };
}

describe('edgeLabel', () => {
  it('classifies markdown, mention, backtick, contains, glob, and scope', () => {
    expect(
      classifyEdge(edge({ relation: 'references', explanation: 'Markdown link to "x.md"' })),
    ).toBe('markdown-link');
    expect(
      classifyEdge(
        edge({
          relation: 'references',
          explanation: 'Rule @-mention "guide.md" (the agent reads the file; it is not inlined)',
        }),
      ),
    ).toBe('mention');
    expect(
      classifyEdge(
        edge({
          relation: 'references',
          evidence: 'inferred',
          explanation:
            'Inline code "a/b.ts" matches an existing file; heuristic, not a declared reference',
        }),
      ),
    ).toBe('inferred-backtick');
    expect(
      classifyEdge(
        edge({
          relation: 'contains',
          evidence: 'derived',
          explanation: 'File inside the skill folder',
        }),
      ),
    ).toBe('contains');
    expect(
      classifyEdge(
        edge({
          relation: 'applies-to',
          evidence: 'derived',
          explanation: 'Rule glob "src/**/*.ts" matches discovered path',
        }),
      ),
    ).toBe('glob-apply');
    expect(
      classifyEdge(
        edge({
          relation: 'applies-to',
          evidence: 'derived',
          explanation:
            'AGENTS.md applies to its directory and below; nested files combine with parents',
        }),
      ),
    ).toBe('applies-scope');
  });

  it('returns human-readable labels', () => {
    expect(
      edgeLabel(
        edge({
          relation: 'applies-to',
          evidence: 'derived',
          explanation: 'Skill paths "packages/**/*.ts" matches discovered path',
        }),
      ),
    ).toBe('Glob / paths apply');
    expect(edgeLabel(edge({ relation: 'contains', evidence: 'derived', explanation: 'x' }))).toBe(
      'Contains (folder)',
    );
  });
});
