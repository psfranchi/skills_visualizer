import { useEffect, useRef, useState } from 'react';
import type {
  AgentEdge,
  AgentGraph,
  AgentNode,
  GraphDiagnostic,
  Severity,
  SourceLocation,
} from '../core';
import type { FileResponse } from '../server/app';
import { activationLabel } from './activation';
import { fetchFile } from './api';
import { canRichMarkdownPreview, type DocViewMode, initialDocViewMode } from './doc-view';
import { edgeLabel } from './edge-labels';
import { MarkdownPreview } from './MarkdownPreview';
import {
  diagnosticsForNode,
  ENGINE_LABELS,
  filterDiagnostics,
  incidentEdges,
  nodeEngine,
  pathToNearestInstruction,
  safeHref,
  sourceDisplay,
} from './model';
import { SkillEditor } from './SkillEditor';

interface InspectorProps {
  graph: AgentGraph;
  node: AgentNode | null;
  severities: ReadonlySet<Severity>;
  visibleEdgeIds: ReadonlySet<string>;
  canEdit: boolean;
  onSelect(id: string): void;
  onGraphApplied(graph: AgentGraph): void;
}

function location(source: SourceLocation): string {
  return source.start ? `${source.path}:${source.start.line}:${source.start.column}` : source.path;
}

function AttributeValue({ value }: { value: unknown }) {
  if (typeof value === 'string') {
    const href = safeHref(value);
    return href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {value}
      </a>
    ) : (
      <span className="value">{value}</span>
    );
  }
  if (Array.isArray(value)) {
    return (
      <ul className="attr-list">
        {value.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static attribute arrays.
          <li key={index}>
            <AttributeValue value={item} />
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === 'object' && value !== null) {
    return <Attributes attributes={value as Record<string, unknown>} />;
  }
  return <span className="value">{String(value)}</span>;
}

function Attributes({ attributes }: { attributes: Record<string, unknown> }) {
  const entries = Object.entries(attributes);
  if (entries.length === 0) return <p className="muted">None</p>;
  return (
    <dl className="attributes">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>
            <AttributeValue value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DiagnosticList({ diagnostics }: { diagnostics: readonly GraphDiagnostic[] }) {
  if (diagnostics.length === 0) return <p className="muted">None at the selected severities.</p>;
  return (
    <ul className="diagnostics">
      {diagnostics.map((d, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: diagnostics have no id and do not reorder.
        <li key={index} className={`severity-${d.severity}`}>
          <strong>{d.severity}</strong> <code>{d.code}</code> {d.message}
          {d.path && (
            <span className="muted">
              {' '}
              ({d.path}
              {d.span ? `:${d.span.line}:${d.span.column}` : ''})
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

interface EdgeListProps {
  title: string;
  edges: readonly AgentEdge[];
  direction: 'incoming' | 'outgoing';
  names: ReadonlyMap<string, string>;
  focused: AgentEdge | null;
  onSelect(id: string): void;
  onFocus(edge: AgentEdge): void;
}

function EdgeList({ title, edges, direction, names, focused, onSelect, onFocus }: EdgeListProps) {
  return (
    <section>
      <h3>
        {title} <span className="count">{edges.length}</span>
      </h3>
      {edges.length === 0 ? (
        <p className="muted">None</p>
      ) : (
        <ul className="edges">
          {edges.map((edge) => {
            const other = direction === 'incoming' ? edge.source : edge.target;
            return (
              <li key={edge.id} className={edge === focused ? 'focused' : undefined}>
                <span className={`edge-kind-badge`}>{edgeLabel(edge)}</span>{' '}
                <span className={`evidence-badge evidence-${edge.evidence}`}>{edge.evidence}</span>{' '}
                <span className="relation">{edge.relation}</span>{' '}
                <button type="button" className="link" onClick={() => onSelect(other)}>
                  {names.get(other) ?? other}
                </button>
                <div className="explanation">
                  {edge.explanation}
                  {edge.confidence !== undefined && ` (confidence ${edge.confidence})`}
                </div>
                {edge.provenance && (
                  <button type="button" className="link small" onClick={() => onFocus(edge)}>
                    Show evidence at {location(edge.provenance)}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

type FileState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; file: FileResponse };

function SourceView({ focus }: { focus: SourceLocation }) {
  const [state, setState] = useState<FileState>({ status: 'loading' });
  const [mode, setMode] = useState<DocViewMode>('source');
  const preRef = useRef<HTMLPreElement>(null);
  const markRef = useRef<HTMLElement>(null);
  const start = focus.start?.offset;

  // Scrolls only the <pre> (position: relative), not the inspector, to the highlighted range.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the file or range changes.
  useEffect(() => {
    const pre = preRef.current;
    const mark = markRef.current;
    if (pre) pre.scrollTop = mark ? Math.max(0, mark.offsetTop - pre.clientHeight / 3) : 0;
  }, [state, start, mode]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch after a rescan changes the hash.
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetchFile(focus.path).then(
      (file) => {
        if (cancelled) return;
        setState({ status: 'ok', file });
        setMode(initialDocViewMode(canRichMarkdownPreview(focus.path, file)));
      },
      (error: unknown) =>
        !cancelled &&
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Failed' }),
    );
    return () => {
      cancelled = true;
    };
  }, [focus.path, focus.contentHash]);

  if (state.status === 'loading') return <p className="muted">Loading {focus.path}…</p>;
  if (state.status === 'error') return <p className="error">{state.message}</p>;
  const { file } = state;
  const display = sourceDisplay(file, focus);
  const parts = display.kind === 'highlight' ? display.parts : null;
  const canPreview = canRichMarkdownPreview(focus.path, file);
  const showPreview = canPreview && mode === 'preview';

  return (
    <div className="source">
      <div className="source-header">
        <code>{location(focus)}</code>
        {display.kind === 'stale' && (
          <span className="error"> — file changed since scan — rescan</span>
        )}
        {display.kind === 'redacted' && (
          <span className="muted"> — secrets redacted; rich preview disabled</span>
        )}
      </div>
      {canPreview && (
        <fieldset className="doc-view-toggle">
          <legend className="visually-hidden">Document view</legend>
          <button
            type="button"
            className={mode === 'preview' ? 'active' : undefined}
            aria-pressed={mode === 'preview'}
            onClick={() => setMode('preview')}
          >
            Preview
          </button>
          <button
            type="button"
            className={mode === 'source' ? 'active' : undefined}
            aria-pressed={mode === 'source'}
            onClick={() => setMode('source')}
          >
            Source
          </button>
        </fieldset>
      )}
      {showPreview ? (
        <MarkdownPreview markdown={file.text} />
      ) : (
        <pre ref={preRef}>
          {parts ? (
            <>
              {parts.before}
              <mark ref={markRef}>{parts.match}</mark>
              {parts.after}
            </>
          ) : (
            file.text
          )}
        </pre>
      )}
    </div>
  );
}

export function Inspector({
  graph,
  node,
  severities,
  visibleEdgeIds,
  canEdit,
  onSelect,
  onGraphApplied,
}: InspectorProps) {
  const [focusedEdge, setFocusedEdge] = useState<AgentEdge | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the edge focus when the selection changes.
  useEffect(() => setFocusedEdge(null), [node?.id]);

  if (!node) {
    const diagnostics = filterDiagnostics(graph.diagnostics, severities);
    return (
      <aside className="inspector" aria-label="Inspector">
        <h2>Graph</h2>
        <p>
          {graph.nodes.length} nodes · {graph.edges.length} edges · {graph.diagnostics.length}{' '}
          diagnostics
        </p>
        <p className="muted">Select a node to see its source and evidence.</p>
        <h3>
          Diagnostics <span className="count">{diagnostics.length}</span>
        </h3>
        <DiagnosticList diagnostics={diagnostics} />
      </aside>
    );
  }

  const names = new Map(graph.nodes.map((n) => [n.id, n.name]));
  const { incoming, outgoing } = incidentEdges(graph, node.id, visibleEdgeIds);
  const all = incidentEdges(graph, node.id, null);
  const hiddenCount = all.incoming.length + all.outgoing.length - incoming.length - outgoing.length;
  const focus = focusedEdge?.provenance ?? node.source;
  const activation = activationLabel(node.attributes.activation);
  const engine = nodeEngine(node);
  const instructionPath = pathToNearestInstruction(graph, node.id, visibleEdgeIds);

  return (
    <aside className="inspector" aria-label="Inspector">
      <h2>{node.name}</h2>
      <p>
        <span className={`kind-badge kind-${node.kind}`}>{node.kind}</span>{' '}
        <span className={`engine-badge engine-${engine}`} title="Engine">
          {ENGINE_LABELS[engine]}
        </span>{' '}
        {activation && (
          <span
            className={`activation-badge activation-${String(node.attributes.activation)}`}
            title="Rule activation mode"
          >
            {activation}
          </span>
        )}{' '}
        <code>{node.id}</code>
      </p>
      {instructionPath && instructionPath.length > 1 && (
        <p className="instruction-path">
          Path to instruction:{' '}
          {instructionPath.map((id, index) => (
            <span key={id}>
              {index > 0 && ' → '}
              <button type="button" className="link" onClick={() => onSelect(id)}>
                {names.get(id) ?? id}
              </button>
            </span>
          ))}
        </p>
      )}
      {node.source && (
        <p>
          Source:{' '}
          <button type="button" className="link" onClick={() => setFocusedEdge(null)}>
            {location(node.source)}
          </button>
        </p>
      )}
      <h3>Attributes</h3>
      <Attributes attributes={node.attributes} />
      <h3>Diagnostics</h3>
      <DiagnosticList diagnostics={diagnosticsForNode(graph, node, severities)} />
      <EdgeList
        title="Outgoing"
        edges={outgoing}
        direction="outgoing"
        names={names}
        focused={focusedEdge}
        onSelect={onSelect}
        onFocus={setFocusedEdge}
      />
      <EdgeList
        title="Incoming"
        edges={incoming}
        direction="incoming"
        names={names}
        focused={focusedEdge}
        onSelect={onSelect}
        onFocus={setFocusedEdge}
      />
      {hiddenCount > 0 && (
        <p className="muted">{hiddenCount} edges hidden by filters (e.g. inferred).</p>
      )}
      <h3>Source</h3>
      {focus ? <SourceView focus={focus} /> : <p className="muted">No source file.</p>}
      {canEdit && node.kind === 'skill' && <SkillEditor node={node} onApplied={onGraphApplied} />}
    </aside>
  );
}
