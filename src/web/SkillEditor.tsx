import { useEffect, useState } from 'react';
import type { AgentGraph, AgentNode, GraphDiagnostic } from '../core';
import { applyEdit, fetchFile, previewEdit } from './api';
import { canApply, type EditDraft, interpretApplyResponse, type PreviewState } from './edit-model';

interface SkillEditorProps {
  node: AgentNode;
  onApplied(graph: AgentGraph): void;
}

export function SkillEditor({ node, onApplied }: SkillEditorProps) {
  const path = node.source?.path;
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const contentHash = node.source?.contentHash;
  useEffect(() => {
    if (!path || !contentHash) return;
    let cancelled = false;
    setDraft(null);
    setPreview(null);
    setMessage(null);
    fetchFile(path).then(
      (file) => {
        if (cancelled) return;
        setDraft({ path, expectedHash: file.hash, text: file.text });
      },
      (error: unknown) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Failed to load skill');
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path, contentHash]);

  if (!path) return null;
  if (!draft) return <p className="muted">{message ?? 'Loading skill for editing…'}</p>;

  const onPreview = () => {
    setBusy(true);
    setMessage(null);
    previewEdit({ path: draft.path, expectedHash: draft.expectedHash, newText: draft.text })
      .then((result) => {
        setPreview({
          diff: result.diff,
          diagnostics: result.diagnostics,
          impact: result.impact,
          blocking: result.blocking,
          previewedText: draft.text,
        });
        if (result.blocking) setMessage('Fix blocking diagnostics before applying.');
      })
      .catch((error: unknown) => {
        setPreview(null);
        setMessage(error instanceof Error ? error.message : 'Preview failed');
      })
      .finally(() => setBusy(false));
  };

  const onApply = () => {
    if (!canApply(draft, preview)) return;
    setBusy(true);
    setMessage(null);
    applyEdit({ path: draft.path, expectedHash: draft.expectedHash, newText: draft.text })
      .then(({ status, body }) => {
        const outcome = interpretApplyResponse(status, body);
        if (outcome.kind === 'ok' && body.graph) {
          onApplied(body.graph);
          setDraft({ ...draft, expectedHash: outcome.hash });
          setPreview(null);
          setMessage('Applied.');
          return;
        }
        if (outcome.kind === 'conflict') {
          setDraft({ ...draft, expectedHash: outcome.currentHash });
          setPreview(null);
          setMessage('file changed on disk — reload');
          return;
        }
        setMessage(outcome.kind === 'error' ? outcome.message : 'Apply failed');
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : 'Apply failed');
      })
      .finally(() => setBusy(false));
  };

  return (
    <section className="skill-editor" aria-label="Edit skill">
      <h3>Edit</h3>
      <textarea
        className="skill-editor-text"
        value={draft.text}
        disabled={busy}
        spellCheck={false}
        onChange={(event) => {
          setDraft({ ...draft, text: event.target.value });
          setPreview(null);
          setMessage(null);
        }}
      />
      <div className="skill-editor-actions">
        <button type="button" disabled={busy} onClick={onPreview}>
          Preview
        </button>
        <button type="button" disabled={busy || !canApply(draft, preview)} onClick={onApply}>
          Apply
        </button>
      </div>
      {message && (
        <p className={message.startsWith('file changed') ? 'error' : 'muted'} role="status">
          {message}
        </p>
      )}
      {preview && (
        <div className="skill-editor-preview">
          <h4>Diff</h4>
          <pre className="diff">{preview.diff}</pre>
          <h4>Impact</h4>
          <p className="muted">
            +{preview.impact.edgesAdded.length} / −{preview.impact.edgesRemoved.length} edges
          </p>
          <DiagnosticSummary diagnostics={preview.diagnostics} />
        </div>
      )}
    </section>
  );
}

function DiagnosticSummary({ diagnostics }: { diagnostics: GraphDiagnostic[] }) {
  if (diagnostics.length === 0) return null;
  return (
    <>
      <h4>Diagnostics</h4>
      <ul className="diagnostic-list">
        {diagnostics.map((d) => (
          <li key={`${d.code}:${d.message}`} className={`severity-${d.severity}`}>
            <strong>{d.severity}</strong> {d.code}: {d.message}
          </li>
        ))}
      </ul>
    </>
  );
}
