import { describe, expect, it } from 'vitest';
import {
  limitPatterns,
  MAX_GLOB_MATCHES,
  MAX_PATTERN_LENGTH,
  MAX_PATTERNS_PER_NODE,
  matchDiscoveredPaths,
} from './glob-match';

describe('matchDiscoveredPaths', () => {
  const paths = [
    'README.md',
    'packages/foo/bar.ts',
    'src/a.ts',
    'src/b.tsx',
    'src/nested/c.ts',
    'test/x.ts',
  ];

  it('matches ** globs against a pre-sorted path list', () => {
    expect(matchDiscoveredPaths('src/**/*.ts', paths).matches).toEqual([
      'src/a.ts',
      'src/nested/c.ts',
    ]);
  });

  it('matches packages/**/*.ts style skill paths', () => {
    expect(matchDiscoveredPaths('packages/**/*.ts', paths).matches).toEqual([
      'packages/foo/bar.ts',
    ]);
  });

  it('returns empty when nothing matches', () => {
    expect(matchDiscoveredPaths('docs/**/*.md', paths)).toEqual({ matches: [], capped: false });
  });

  it('caps fan-out and reports capped', () => {
    const many = Array.from(
      { length: MAX_GLOB_MATCHES + 5 },
      (_, i) => `src/f${String(i).padStart(3, '0')}.ts`,
    );
    const result = matchDiscoveredPaths('src/**/*.ts', many);
    expect(result.matches).toHaveLength(MAX_GLOB_MATCHES);
    expect(result.capped).toBe(true);
    expect(result.matches[0]).toBe('src/f000.ts');
  });
});

describe('limitPatterns', () => {
  it('caps count and skips over-long patterns', () => {
    const many = Array.from({ length: MAX_PATTERNS_PER_NODE + 3 }, (_, i) => `p${i}.ts`);
    const limited = limitPatterns([...many, 'x'.repeat(MAX_PATTERN_LENGTH + 1)]);
    expect(limited.patterns).toHaveLength(MAX_PATTERNS_PER_NODE);
    expect(limited.cappedCount).toBe(true);
    expect(limited.skippedTooLong).toBe(1);
  });
});
