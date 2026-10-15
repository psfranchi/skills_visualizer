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
  it('maps scanner linkKind tags (not explanation text)', () => {
    expect(
      classifyEdge(
        edge({
          relation: 'references',
          linkKind: 'markdown-link',
          explanation: 'unrelated text that used to drive classification',
        }),
      ),
    ).toBe('markdown-link');
    expect(
      classifyEdge(
        edge({
          relation: 'applies-to',
          linkKind: 'glob-apply',
          explanation: 'Rule glob "src/**/*.ts" matches discovered path',
        }),
      ),
    ).toBe('glob-apply');
    expect(
      classifyEdge(
        edge({
          relation: 'references',
          linkKind: 'mention',
          explanation: 'anything',
        }),
      ),
    ).toBe('mention');
  });

  it('falls back by relation/evidence when linkKind is missing', () => {
    expect(
      classifyEdge(edge({ relation: 'contains', evidence: 'derived', explanation: 'x' })),
    ).toBe('contains');
    expect(
      classifyEdge(edge({ relation: 'applies-to', evidence: 'derived', explanation: 'scope' })),
    ).toBe('applies-scope');
    expect(
      classifyEdge(
        edge({ relation: 'references', evidence: 'inferred', explanation: 'Inline code "a"' }),
      ),
    ).toBe('inferred-backtick');
  });

  it('returns human-readable labels', () => {
    expect(
      edgeLabel(
        edge({
          relation: 'applies-to',
          evidence: 'derived',
          linkKind: 'glob-apply',
          explanation: 'Skill paths "packages/**/*.ts" matches discovered path',
        }),
      ),
    ).toBe('Glob / paths apply');
  });
});
