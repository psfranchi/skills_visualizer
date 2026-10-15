import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView, keymap } from '@codemirror/view';

/** Shared CodeMirror 6 extensions for the skill editor (markdown, wrap, basic keymap). */
export function skillEditorExtensions() {
  return [
    markdown(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.lineWrapping,
  ];
}
