import { describe, expect, it } from 'vitest';
import { skillEditorExtensions } from './codemirror-setup';

describe('skillEditorExtensions', () => {
  it('wires markdown language, history, keymap, and line wrapping', () => {
    const extensions = skillEditorExtensions();
    expect(extensions.length).toBe(4);
    // Each factory returns a non-null extension value CodeMirror can compose.
    for (const ext of extensions) {
      expect(ext).toBeTruthy();
    }
  });
});
