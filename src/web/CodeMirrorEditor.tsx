import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { skillEditorExtensions } from './codemirror-setup';

interface CodeMirrorEditorProps {
  value: string;
  onChange(value: string): void;
  editable?: boolean;
  className?: string;
}

/** Thin React host for a CodeMirror 6 view; parent should remount with `key` on path change. */
export function CodeMirrorEditor({
  value,
  onChange,
  editable = true,
  className,
}: CodeMirrorEditorProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const editableCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount once; value/editable synced below; remount via key.
  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: value,
        extensions: [
          ...skillEditorExtensions(),
          editableCompartment.current.of(EditorView.editable.of(editable)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: editableCompartment.current.reconfigure(EditorView.editable.of(editable)),
    });
  }, [editable]);

  return <div ref={parentRef} className={className ? `cm-host ${className}` : 'cm-host'} />;
}
