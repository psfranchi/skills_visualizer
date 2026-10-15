import { createTwoFilesPatch } from 'diff';

/** Unified diff of the decoded original vs the planned text (BOM already stripped). */
export function unifiedDiff(path: string, before: string, after: string): string {
  return createTwoFilesPatch(path, path, before, after, undefined, undefined, {
    context: 3,
  });
}
