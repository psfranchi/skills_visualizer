import type { GraphDiagnostic } from '../core';

export interface EditDraft {
  path: string;
  expectedHash: string;
  text: string;
  /** User's text kept across a disk conflict until they load disk or re-preview. */
  conflictDraft?: string;
}

export interface PreviewState {
  diff: string;
  diffTruncated: boolean;
  diagnostics: GraphDiagnostic[];
  impact: { edgesAdded: string[]; edgesRemoved: string[] };
  blocking: boolean;
  /** Text that was sent with the successful preview. */
  previewedText: string;
}

/** Apply is allowed only after a successful preview of the current draft with no blockers. */
export function canApply(draft: EditDraft, preview: PreviewState | null): boolean {
  return preview !== null && !preview.blocking && preview.previewedText === draft.text;
}

/**
 * Editor typing while `conflict` is true must not dismiss the conflict UI — only
 * Load disk / Keep draft clear it. Preview/message stay until those actions.
 */
export function afterEditorChange(
  draft: EditDraft,
  text: string,
  conflict: boolean,
): { draft: EditDraft; conflict: boolean; clearAncillary: boolean } {
  return {
    draft: { ...draft, text },
    conflict,
    clearAncillary: !conflict,
  };
}

/** Skip refetch when the draft already matches the node's content hash (e.g. just applied). */
export function shouldReloadSkillFile(
  path: string,
  contentHash: string,
  draft: EditDraft | null,
): boolean {
  return draft === null || draft.path !== path || draft.expectedHash !== contentHash;
}

export type ApplyOutcome =
  | { kind: 'ok'; hash: string }
  | { kind: 'conflict'; currentHash: string }
  | { kind: 'error'; message: string };

export function interpretApplyResponse(
  status: number,
  body: { hash?: string; currentHash?: string; error?: string },
): ApplyOutcome {
  if (status === 200 && typeof body.hash === 'string') return { kind: 'ok', hash: body.hash };
  if (status === 409 && typeof body.currentHash === 'string') {
    return { kind: 'conflict', currentHash: body.currentHash };
  }
  return { kind: 'error', message: body.error ?? `Apply failed (${status})` };
}

/** After apply, keep the prior selection when that node id still exists. */
export function selectionAfterApply(
  previousId: string | null,
  graph: { nodes: { id: string }[] },
): string | null {
  if (previousId === null) return null;
  return graph.nodes.some((n) => n.id === previousId) ? previousId : null;
}
