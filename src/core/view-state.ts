import { z } from 'zod';

export const MAX_PINNED_NODES = 10_000;

const PositionSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

/** Per-repo viewer state, stored outside the repository. */
export const GraphViewStateSchema = z.object({
  schemaVersion: z.literal(1),
  /** Node id → user-pinned center position (overrides the automatic layout). */
  pinned: z
    .record(z.string().min(1).max(4096), PositionSchema)
    .refine((pinned) => Object.keys(pinned).length <= MAX_PINNED_NODES, 'Too many pinned nodes'),
});

export type Position = z.infer<typeof PositionSchema>;
export type GraphViewState = z.infer<typeof GraphViewStateSchema>;

export function emptyViewState(): GraphViewState {
  return { schemaVersion: 1, pinned: {} };
}
