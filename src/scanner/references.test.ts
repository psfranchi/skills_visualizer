import { describe, expect, it } from 'vitest';
import type { RepoPath } from '../core';
import { parseMarkdown } from './markdown';
import {
  localLinkTarget,
  looksLikePath,
  mentionEdges,
  referenceContext,
  trimTrailingPunctuation,
} from './references';

describe('localLinkTarget', () => {
  it.each([
    ['docs/a.md#section', 'docs/a.md'],
    ['a%20b.md?x=1', 'a b.md'],
    ['../up.md', '../up.md'],
    ['/root.md', '/root.md'],
  ])('keeps local %j as %j', (url, expected) => {
    expect(localLinkTarget(url)).toBe(expected);
  });

  it.each(['https://example.com/x.md', 'mailto:a@b.c', '#top', '//cdn/x', ''])(
    'ignores %j',
    (url) => {
      expect(localLinkTarget(url)).toBeNull();
    },
  );
});

describe('looksLikePath', () => {
  it.each(['scripts/run.sh', 'package.json', '.cursor/rules/x.mdc', 'src/core/'])(
    'accepts %j',
    (v) => {
      expect(looksLikePath(v)).toBe(true);
    },
  );

  it.each(['pnpm check', 'node:fs', '--out', 'src/**/*.ts', 'README', '..', '<dir>'])(
    'rejects %j',
    (v) => {
      expect(looksLikePath(v)).toBe(false);
    },
  );
});

describe('mentionEdges', () => {
  it('finds @path mentions in prose with exact offsets, skipping code and emails', () => {
    const text = 'Read @docs/testing.md. Mail me@example.com, `@skip/me.md`, and @rule-name.\n';
    const ctx = referenceContext(
      { path: '.cursor/rules/x.mdc' as RepoPath, text, bom: false, contentHash: 'h'.repeat(64) },
      'cursor',
      'rule:x',
    );
    const edges = mentionEdges(parseMarkdown(text), ctx);
    expect(edges).toHaveLength(1);
    const [edge] = edges;
    const start = edge?.provenance?.start?.offset ?? -1;
    const end = edge?.provenance?.end?.offset ?? -1;
    expect(text.slice(start, end)).toBe('@docs/testing.md');
    expect(edge?.target).toMatchObject({
      candidates: ['docs/testing.md', '.cursor/rules/docs/testing.md'],
      diagnoseAmbiguity: true,
    });
  });

  it('handles a mention followed by a huge punctuation run in linear time', () => {
    const text = `@a${'.'.repeat(200_000)}b\n`;
    const ctx = referenceContext(
      { path: '.cursor/rules/x.mdc' as RepoPath, text, bom: false, contentHash: 'h'.repeat(64) },
      'cursor',
      'rule:x',
    );
    const started = performance.now();
    mentionEdges(parseMarkdown(text), ctx);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('trimTrailingPunctuation', () => {
  it('strips only trailing sentence punctuation', () => {
    expect(trimTrailingPunctuation('docs/a.md.,;:')).toBe('docs/a.md');
    expect(trimTrailingPunctuation('a.b')).toBe('a.b');
    expect(trimTrailingPunctuation('...')).toBe('');
  });
});
