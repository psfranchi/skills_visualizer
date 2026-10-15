import { describe, expect, it } from 'vitest';
import { MAX_DIFF_CHARS, unifiedDiff } from './diff';

describe('unifiedDiff', () => {
  it('returns a normal patch for small inputs', () => {
    const result = unifiedDiff('a.md', 'hello\n', 'hello world\n');
    expect(result.diffTruncated).toBe(false);
    expect(result.diff).toContain('+hello world');
  });

  it('omits the patch when either side exceeds the size cap', () => {
    const big = 'x'.repeat(MAX_DIFF_CHARS + 1);
    const result = unifiedDiff('a.md', big, 'y');
    expect(result.diffTruncated).toBe(true);
    expect(result.diff).toContain('diff omitted');
  });
});
