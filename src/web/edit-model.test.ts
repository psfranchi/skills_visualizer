import { describe, expect, it } from 'vitest';
import {
  afterEditorChange,
  canApply,
  interpretApplyResponse,
  type PreviewState,
  selectionAfterApply,
  shouldReloadSkillFile,
} from './edit-model';

const draft = { path: 'a', expectedHash: 'h', text: 'hello' };
const preview = (over: Partial<PreviewState> = {}): PreviewState => ({
  diff: '',
  diffTruncated: false,
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

describe('selectionAfterApply', () => {
  it('keeps the selection when the node id still exists', () => {
    expect(selectionAfterApply('skill:a', { nodes: [{ id: 'skill:a' }, { id: 'b' }] })).toBe(
      'skill:a',
    );
    expect(selectionAfterApply('gone', { nodes: [{ id: 'skill:a' }] })).toBeNull();
    expect(selectionAfterApply(null, { nodes: [{ id: 'skill:a' }] })).toBeNull();
  });
});

describe('afterEditorChange', () => {
  it('keeps conflict locked and does not clear ancillary state', () => {
    const next = afterEditorChange(draft, 'typed', true);
    expect(next.conflict).toBe(true);
    expect(next.clearAncillary).toBe(false);
    expect(next.draft.text).toBe('typed');
  });

  it('clears ancillary flags when not in conflict', () => {
    const next = afterEditorChange(draft, 'typed', false);
    expect(next.conflict).toBe(false);
    expect(next.clearAncillary).toBe(true);
  });
});

describe('shouldReloadSkillFile', () => {
  it('skips reload when draft already matches path and hash', () => {
    expect(shouldReloadSkillFile('a', 'h', draft)).toBe(false);
    expect(shouldReloadSkillFile('a', 'new', draft)).toBe(true);
    expect(shouldReloadSkillFile('b', 'h', draft)).toBe(true);
    expect(shouldReloadSkillFile('a', 'h', null)).toBe(true);
  });
});
