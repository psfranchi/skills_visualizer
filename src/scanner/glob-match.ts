import picomatch from 'picomatch';

/** Cap fan-out so a broad glob cannot flood the graph. */
export const MAX_GLOB_MATCHES = 50;

/**
 * Match a glob against a known path list only (no filesystem walk).
 * Results are sorted for stable graph IDs; capped at `max`.
 */
export function matchDiscoveredPaths(
  pattern: string,
  paths: readonly string[],
  max = MAX_GLOB_MATCHES,
): { matches: string[]; capped: boolean } {
  const trimmed = pattern.trim();
  if (trimmed === '') return { matches: [], capped: false };
  const isMatch = picomatch(trimmed, { dot: true });
  const matches: string[] = [];
  for (const path of [...paths].sort()) {
    if (!isMatch(path)) continue;
    matches.push(path);
    if (matches.length >= max) return { matches, capped: true };
  }
  return { matches, capped: false };
}
