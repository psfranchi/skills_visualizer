import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentGraph, NodeKind, Position } from '../core';
import { layoutHierarchy } from '../layout';
import type { Meta } from '../server/app';
import {
  fetchGraph,
  fetchMeta,
  fetchViewState,
  rescan,
  saveViewState,
  saveViewStateOnExit,
} from './api';
import { GraphCanvas } from './GraphCanvas';
import { Inspector } from './Inspector';
import { Legend } from './Legend';
import {
  defaultFilters,
  type Filters,
  listedNodes,
  nodeSeverities,
  searchMatches,
  visibleGraph,
} from './model';
import { NodeList } from './NodeList';
import { DebouncedSaver } from './pin-saver';
import { Toolbar } from './Toolbar';

const SAVE_DELAY_MS = 500;

type Pins = Record<string, Position>;

/** Persists pins after a quiet period; `flush` saves immediately; leaving the page flushes. */
function usePinPersistence(onError: (message: string) => void) {
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [saver] = useState(
    () =>
      new DebouncedSaver<Pins>(
        {
          save: (pinned) =>
            saveViewState({ schemaVersion: 1, pinned }).catch((error: unknown) =>
              onErrorRef.current(
                error instanceof Error ? error.message : 'Saving view state failed',
              ),
            ),
          saveOnExit: (pinned) => saveViewStateOnExit({ schemaVersion: 1, pinned }),
          setTimer: (callback, ms) => setTimeout(callback, ms),
          clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
        },
        SAVE_DELAY_MS,
      ),
  );
  useEffect(() => {
    const onPageHide = () => saver.flushOnExit();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') saver.flushOnExit();
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      saver.dispose();
    };
  }, [saver]);
  const schedule = useCallback((pinned: Pins) => saver.schedule(pinned), [saver]);
  const flush = useCallback((pinned: Pins) => saver.flush(pinned), [saver]);
  return { schedule, flush };
}

export function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [graph, setGraph] = useState<AgentGraph | null>(null);
  const [pinned, setPinned] = useState<Pins>({});
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fitToken, setFitToken] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pins = usePinPersistence(setError);

  useEffect(() => {
    Promise.all([fetchMeta(), fetchGraph(), fetchViewState()]).then(
      ([m, g, view]) => {
        setMeta(m);
        setGraph(g);
        setPinned(view.pinned);
        setFitToken((t) => t + 1);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : 'Loading failed'),
    );
  }, []);

  const visible = useMemo(() => (graph ? visibleGraph(graph, filters) : null), [graph, filters]);
  const matches = useMemo(
    () => (graph ? searchMatches(graph.nodes, filters.search) : null),
    [graph, filters.search],
  );
  const layout = useMemo(
    () =>
      graph && visible
        ? layoutHierarchy(graph, {
            visibleIds: visible.nodeIds,
            visibleEdgeIds: visible.edgeIds,
            pinned,
          })
        : null,
    [graph, visible, pinned],
  );
  const severities = useMemo(
    () => (graph ? nodeSeverities(graph, filters.severities) : new Map()),
    [graph, filters.severities],
  );
  const kindCounts = useMemo(() => {
    const counts = new Map<NodeKind, number>();
    for (const n of graph?.nodes ?? []) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
    return counts;
  }, [graph]);

  const onPin = useCallback(
    (id: string, position: Position) => {
      setPinned((current) => {
        const next = { ...current, [id]: position };
        pins.schedule(next);
        return next;
      });
    },
    [pins],
  );

  const onResetLayout = () => {
    setPinned({});
    pins.flush({});
    setFitToken((t) => t + 1);
  };

  const onRescan = () => {
    setBusy(true);
    rescan()
      .then((g) => {
        setGraph(g);
        setError(null);
        if (selectedId && !g.nodes.some((n) => n.id === selectedId)) setSelectedId(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Rescan failed'))
      .finally(() => setBusy(false));
  };

  if (!graph || !visible || !layout) {
    return (
      <main className="loading">
        {error ? <p className="error">{error}</p> : <p>Scanning repository…</p>}
      </main>
    );
  }

  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null;
  const shownNodes = graph.nodes.filter((n) => visible.nodeIds.has(n.id));
  const shownEdges = graph.edges.filter((e) => visible.edgeIds.has(e.id));

  return (
    <div className="app">
      <Toolbar
        title={meta?.displayName ?? 'Skills Visualizer'}
        filters={filters}
        kindCounts={kindCounts}
        busy={busy}
        onFilters={setFilters}
        onFit={() => setFitToken((t) => t + 1)}
        onResetLayout={onResetLayout}
        onRescan={onRescan}
      />
      {error && (
        <p className="error banner" role="alert">
          {error}
        </p>
      )}
      <NodeList
        nodes={listedNodes(graph, visible, matches)}
        selectedId={selectedId}
        severities={severities}
        onSelect={setSelectedId}
      />
      <main className="canvas">
        <GraphCanvas
          nodes={shownNodes}
          edges={shownEdges}
          layout={layout}
          matches={matches}
          selectedId={selectedId}
          severities={severities}
          fitToken={fitToken}
          onSelect={setSelectedId}
          onPin={onPin}
        />
        <Legend />
      </main>
      <Inspector
        graph={graph}
        node={selected}
        severities={filters.severities}
        visibleEdgeIds={visible.edgeIds}
        onSelect={setSelectedId}
      />
    </div>
  );
}
