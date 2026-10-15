import { createTwoFilesPatch } from 'diff';

/** Above this many UTF-16 code units on either side, skip building a unified diff. */
export const MAX_DIFF_CHARS = 256 * 1024;
/** Above this many lines on either side, skip building a unified diff. */
export const MAX_DIFF_LINES = 8_000;

export interface UnifiedDiffResult {
  diff: string;
  /** True when the inputs were too large and the diff was omitted. */
  diffTruncated: boolean;
}

function lineCount(text: string): number {
  if (text.length === 0) return 0;
  let count = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0x0a) count++;
  }
  return count;
}

/** Unified diff of the decoded original vs the planned text (BOM already stripped). */
export function unifiedDiff(path: string, before: string, after: string): UnifiedDiffResult {
  if (
    before.length > MAX_DIFF_CHARS ||
    after.length > MAX_DIFF_CHARS ||
    lineCount(before) > MAX_DIFF_LINES ||
    lineCount(after) > MAX_DIFF_LINES
  ) {
    return {
      diff: `--- ${path}\n+++ ${path}\n@@ diff omitted: file too large to preview @@\n`,
      diffTruncated: true,
    };
  }
  return {
    diff: createTwoFilesPatch(path, path, before, after, undefined, undefined, { context: 3 }),
    diffTruncated: false,
  };
}
