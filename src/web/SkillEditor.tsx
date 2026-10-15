import { useEffect, useRef, useState } from 'react';
import type { AgentGraph, AgentNode, GraphDiagnostic } from '../core';
import { applyEdit, fetchFile, previewEdit } from './api';
import { CodeMirrorEditor } from './CodeMirrorEditor';
import {
  afterEditorChange,
  canApply,
  type EditDraft,
  interpretApplyResponse,
  type PreviewState,
  shouldReloadSkillFile,
} from './edit-model';
import { MarkdownPreview } from './MarkdownPreview';

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
  const [conflict, setConflict] = useState(false);
  const [redacted, setRedacted] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const contentHash = node.source?.contentHash;
  useEffect(() => {
    if (!path || !contentHash) return;
    if (!shouldReloadSkillFile(path, contentHash, draftRef.current)) return;

    let cancelled = false;
    setDraft(null);
    setPreview(null);
    setMessage(null);
    setConflict(false);
    setRedacted(false);
    fetchFile(path).then(
      (file) => {
        if (cancelled) return;
        setRedacted(file.redacted);
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

  const onTextChange = (text: string) => {
    const next = afterEditorChange(draft, text, conflict);
    setDraft(next.draft);
    setConflict(next.conflict);
    if (next.clearAncillary) {
      setPreview(null);
      setMessage(null);
    }
  };

  const onPreview = () => {
    setBusy(true);
    setMessage(null);
    previewEdit({ path: draft.path, expectedHash: draft.expectedHash, newText: draft.text })
      .then((result) => {
        if (!result.ok) {
          setPreview(null);
          if (result.status === 409 && result.currentHash) {
            setDraft({
              ...draft,
              expectedHash: result.currentHash,
              conflictDraft: draft.text,
            });
            setConflict(true);
            setMessage('file changed on disk');
            return;
          }
          setMessage(result.error ?? `Preview failed (${result.status})`);
          return;
        }
        setConflict(false);
        setPreview({
          diff: result.preview.diff,
          diffTruncated: result.preview.diffTruncated,
          diagnostics: result.preview.diagnostics,
          impact: result.preview.impact,
          blocking: result.preview.blocking,
          previewedText: draft.text,
        });
        if (result.preview.blocking) setMessage('Fix blocking diagnostics before applying.');
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
          // Sync ref before onApplied so the reload effect skips when contentHash updates.
          const nextDraft = { path: draft.path, expectedHash: outcome.hash, text: draft.text };
          draftRef.current = nextDraft;
          setDraft(nextDraft);
          setPreview(null);
          setConflict(false);
          setMessage('Applied.');
          onApplied(body.graph);
          return;
        }
        if (outcome.kind === 'conflict') {
          setDraft({
            ...draft,
            expectedHash: outcome.currentHash,
            conflictDraft: draft.text,
          });
          setPreview(null);
          setConflict(true);
          setMessage('file changed on disk');
          return;
        }
        setMessage(outcome.kind === 'error' ? outcome.message : 'Apply failed');
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : 'Apply failed');
      })
      .finally(() => setBusy(false));
  };

  const loadDiskVersion = () => {
    setBusy(true);
    fetchFile(path)
      .then((file) => {
        setRedacted(file.redacted);
        setDraft({ path, expectedHash: file.hash, text: file.text });
        setPreview(null);
        setConflict(false);
        setMessage(null);
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : 'Failed to reload');
      })
      .finally(() => setBusy(false));
  };

  const keepDraft = () => {
    const text = draft.conflictDraft ?? draft.text;
    setDraft({ path: draft.path, expectedHash: draft.expectedHash, text });
    setPreview(null);
    setConflict(false);
    setMessage('Re-preview against the new hash before applying.');
  };

  const editorLocked = busy || conflict || redacted;

  return (
    <section className="skill-editor" aria-label="Edit skill">
      <h3>Edit</h3>
      {redacted && (
        <p className="muted">Editing disabled — file content was redacted for secrets.</p>
      )}
      <div className="skill-editor-split">
        <CodeMirrorEditor
          key={path}
          className="skill-editor-cm"
          value={draft.text}
          editable={!editorLocked}
          onChange={onTextChange}
        />
        <div className="skill-editor-live">
          <h4>Live preview</h4>
          {redacted ? (
            <p className="muted">Rich preview disabled for redacted or secret-bearing content.</p>
          ) : (
            <MarkdownPreview markdown={draft.text} />
          )}
        </div>
      </div>
      <div className="skill-editor-actions">
        <button type="button" disabled={busy || redacted || conflict} onClick={onPreview}>
          Preview diff
        </button>
        <button
          type="button"
          disabled={busy || redacted || conflict || !canApply(draft, preview)}
          onClick={onApply}
        >
          Apply
        </button>
      </div>
      {conflict && (
        <div className="skill-editor-conflict" role="alert">
          <p className="error">file changed on disk</p>
          <div className="skill-editor-actions">
            <button type="button" disabled={busy} onClick={loadDiskVersion}>
              Load disk version
            </button>
            <button type="button" disabled={busy} onClick={keepDraft}>
              Keep my draft (re-preview)
            </button>
          </div>
        </div>
      )}
      {message && !conflict && (
        <p className={message.startsWith('file changed') ? 'error' : 'muted'} role="status">
          {message}
        </p>
      )}
      {preview && (
        <div className="skill-editor-preview">
          <h4>Diff{preview.diffTruncated ? ' (truncated)' : ''}</h4>
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
