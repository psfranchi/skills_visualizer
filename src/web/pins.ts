import type { Position } from '../core';

export type Pins = Record<string, Position>;

/** Drop pins for node ids that no longer exist in the graph. */
export function prunePins(pinned: Pins, knownIds: ReadonlySet<string>): Pins {
  let changed = false;
  const next: Pins = {};
  for (const [id, position] of Object.entries(pinned)) {
    if (!knownIds.has(id)) {
      changed = true;
      continue;
    }
    next[id] = position;
  }
  return changed ? next : pinned;
}
