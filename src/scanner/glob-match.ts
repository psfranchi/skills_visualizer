import picomatch from 'picomatch';

/** Cap fan-out so a broad glob cannot flood the graph. */
export const MAX_GLOB_MATCHES = 50;

/** Max glob/paths patterns considered per rule or skill node. */
export const MAX_PATTERNS_PER_NODE = 32;

/** Max characters per pattern string (longer patterns are skipped). */
export const MAX_PATTERN_LENGTH = 256;

/** Soft budget for derived glob/paths edges in one enrich pass. */
export const MAX_GLOB_EDGES_TOTAL = 500;

/**
 * Match a glob against a **pre-sorted** discovered path list (no filesystem walk).
 * Caller must pass paths in sorted order so caps are deterministic and reusable.
 */
export function matchDiscoveredPaths(
  pattern: string,
  sortedPaths: readonly string[],
  max = MAX_GLOB_MATCHES,
): { matches: string[]; capped: boolean } {
  const trimmed = pattern.trim();
  if (trimmed === '') return { matches: [], capped: false };
  const isMatch = picomatch(trimmed, { dot: true });
  const matches: string[] = [];
  for (const path of sortedPaths) {
    if (!isMatch(path)) continue;
    matches.push(path);
    if (matches.length >= max) return { matches, capped: true };
  }
  return { matches, capped: false };
}

/** Trim, drop over-long patterns, sort, and cap count for one node. */
export function limitPatterns(raw: readonly string[]): {
  patterns: string[];
  skippedTooLong: number;
  cappedCount: boolean;
} {
  let skippedTooLong = 0;
  const cleaned: string[] = [];
  for (const pattern of raw) {
    const trimmed = pattern.trim();
    if (trimmed === '') continue;
    if (trimmed.length > MAX_PATTERN_LENGTH) {
      skippedTooLong++;
      continue;
    }
    cleaned.push(trimmed);
  }
  const sorted = [...new Set(cleaned)].sort();
  const cappedCount = sorted.length > MAX_PATTERNS_PER_NODE;
  return {
    patterns: cappedCount ? sorted.slice(0, MAX_PATTERNS_PER_NODE) : sorted,
    skippedTooLong,
    cappedCount,
  };
}
