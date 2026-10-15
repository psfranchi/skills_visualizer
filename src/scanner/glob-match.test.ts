import { describe, expect, it } from 'vitest';
import { MAX_GLOB_MATCHES, matchDiscoveredPaths } from './glob-match';

describe('matchDiscoveredPaths', () => {
  const paths = [
    'src/a.ts',
    'src/b.tsx',
    'src/nested/c.ts',
    'test/x.ts',
    'packages/foo/bar.ts',
    'README.md',
  ];

  it('matches ** globs against the path list', () => {
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
    const many = Array.from({ length: MAX_GLOB_MATCHES + 5 }, (_, i) => `src/f${i}.ts`);
    const result = matchDiscoveredPaths('src/**/*.ts', many);
    expect(result.matches).toHaveLength(MAX_GLOB_MATCHES);
    expect(result.capped).toBe(true);
    expect(result.matches[0]).toBe('src/f0.ts');
  });
});
