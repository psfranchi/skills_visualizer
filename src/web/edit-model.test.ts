import { describe, expect, it } from 'vitest';
import { canApply, interpretApplyResponse, type PreviewState } from './edit-model';

const draft = { path: 'a', expectedHash: 'h', text: 'hello' };
const preview = (over: Partial<PreviewState> = {}): PreviewState => ({
  diff: '',
  diagnostics: [],
  impact: { edgesAdded: [], edgesRemoved: [] },
  blocking: false,
  previewedText: 'hello',
  ...over,
});

describe('canApply', () => {
  it('requires a non-blocking preview of the current text', () => {
    expect(canApply(draft, null)).toBe(false);
    expect(canApply(draft, preview())).toBe(true);
    expect(canApply(draft, preview({ blocking: true }))).toBe(false);
    expect(canApply(draft, preview({ previewedText: 'other' }))).toBe(false);
  });
});

describe('interpretApplyResponse', () => {
  it('maps status codes to outcomes', () => {
    expect(interpretApplyResponse(200, { hash: 'abc' })).toEqual({ kind: 'ok', hash: 'abc' });
    expect(interpretApplyResponse(409, { currentHash: 'old' })).toEqual({
      kind: 'conflict',
      currentHash: 'old',
    });
    expect(interpretApplyResponse(400, { error: 'bad' })).toEqual({
      kind: 'error',
      message: 'bad',
    });
  });
});
