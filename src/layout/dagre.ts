import dagre from '@dagrejs/dagre';
import type { AgentEdge, AgentNode, Position } from '../core';

/** Center (`x`, `y`) plus width/height. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EdgeRoute {
  points: Position[];
}

export interface LayoutResult {
  nodes: Record<string, Box>;
  edges: Record<string, EdgeRoute>;
}

export interface LayoutGraph {
  nodes: readonly Pick<AgentNode, 'id' | 'name'>[];
  edges: readonly Pick<AgentEdge, 'id' | 'source' | 'target'>[];
}

export interface LayoutOptions {
  /** Nodes to lay out; all when omitted. Edges need both endpoints visible. */
  visibleIds?: ReadonlySet<string>;
  /** Edges to lay out; all (between visible nodes) when omitted. */
  visibleEdgeIds?: ReadonlySet<string>;
  /** User-pinned centers; they override Dagre, and edges touching them are drawn straight. */
  pinned?: Readonly<Record<string, Position>>;
}

export const NODE_HEIGHT = 50;
const CHAR_WIDTH = 7;
const MIN_WIDTH = 112;
const MAX_WIDTH = 280;
const FALLBACK_COLS = 4;
const FALLBACK_COL_GAP = 200;
const FALLBACK_ROW_GAP = 100;
const FALLBACK_ORIGIN = 100;

export function nodeSize(name: string): { width: number; height: number } {
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, name.length * CHAR_WIDTH + 48));
  return { width, height: NODE_HEIGHT };
}

/** Where the ray from the box center toward `toward` leaves the box. */
export function boxBoundaryPoint(box: Box, toward: Position): Position {
  const dx = toward.x - box.x;
  const dy = toward.y - box.y;
  if (dx === 0 && dy === 0) return { x: box.x, y: box.y };
  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : box.w / 2 / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : box.h / 2 / Math.abs(dy);
  const scale = Math.min(1, scaleX, scaleY);
  return { x: box.x + dx * scale, y: box.y + dy * scale };
}

/** Straight segment between two boxes, clipped to their borders. */
export function straightRoute(source: Box, target: Box): EdgeRoute {
  return { points: [boxBoundaryPoint(source, target), boxBoundaryPoint(target, source)] };
}

/** Loop above the box (Dagre's self-loop routes do not attach to the node in LR mode). */
export function selfLoopRoute(box: Box, index = 0): EdgeRoute {
  const top = box.y - box.h / 2;
  const left = box.x - box.w / 4;
  const right = box.x + box.w / 4;
  const peak = top - 20 - 10 * index;
  return {
    points: [
      { x: left, y: top },
      { x: left, y: peak },
      { x: right, y: peak },
      { x: right, y: top },
    ],
  };
}

function pairKey(source: string, target: string): string {
  return `${source}\0${target}`;
}

/** Grid placement when Dagre throws (never blank the UI). */
function fallbackBoxes(
  nodes: LayoutGraph['nodes'],
  pinned: Readonly<Record<string, Position>>,
): Record<string, Box> {
  const boxes: Record<string, Box> = {};
  nodes.forEach((node, i) => {
    const size = nodeSize(node.name);
    const pin = pinned[node.id];
    if (pin) {
      boxes[node.id] = { x: pin.x, y: pin.y, w: size.width, h: size.height };
      return;
    }
    const col = i % FALLBACK_COLS;
    const row = Math.floor(i / FALLBACK_COLS);
    boxes[node.id] = {
      x: FALLBACK_ORIGIN + col * FALLBACK_COL_GAP,
      y: FALLBACK_ORIGIN + row * FALLBACK_ROW_GAP,
      w: size.width,
      h: size.height,
    };
  });
  return boxes;
}

/**
 * Hierarchical (left → right) layout with Dagre.
 * Self-loops and duplicate multi-edges are kept out of `dagre.layout` (known crash sources);
 * self-loops use {@link selfLoopRoute}; extra parallels share the representative route or go straight.
 * If Dagre still throws, nodes fall back to a grid and all edges use straight / self-loop routes.
 */
export function layoutHierarchy(graph: LayoutGraph, options: LayoutOptions = {}): LayoutResult {
  const { visibleIds, visibleEdgeIds, pinned = {} } = options;
  const nodes = graph.nodes.filter((n) => !visibleIds || visibleIds.has(n.id));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter(
    (e) => ids.has(e.source) && ids.has(e.target) && (!visibleEdgeIds || visibleEdgeIds.has(e.id)),
  );

  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 90, edgesep: 12, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) g.setNode(node.id, nodeSize(node.name));

  /** First non-self-loop edge id per (source, target) — the only edges fed to Dagre. */
  const representativeId = new Map<string, string>();
  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    const key = pairKey(edge.source, edge.target);
    if (representativeId.has(key)) continue;
    representativeId.set(key, edge.id);
    g.setEdge(edge.source, edge.target, {}, edge.id);
  }

  let layoutOk = false;
  try {
    dagre.layout(g);
    layoutOk = true;
  } catch {
    layoutOk = false;
  }

  const boxes: Record<string, Box> = layoutOk
    ? Object.fromEntries(
        nodes.map((node) => {
          const label = g.node(node.id);
          const box = { x: label.x ?? 0, y: label.y ?? 0, w: label.width, h: label.height };
          const pin = pinned[node.id];
          return [node.id, pin ? { ...box, x: pin.x, y: pin.y } : box] as const;
        }),
      )
    : fallbackBoxes(nodes, pinned);

  const routes: Record<string, EdgeRoute> = {};
  const loopsPerNode = new Map<string, number>();
  for (const edge of edges) {
    const source = boxes[edge.source];
    const target = boxes[edge.target];
    if (!source || !target) continue;
    if (edge.source === edge.target) {
      const index = loopsPerNode.get(edge.source) ?? 0;
      loopsPerNode.set(edge.source, index + 1);
      routes[edge.id] = selfLoopRoute(source, index);
      continue;
    }
    const repId = representativeId.get(pairKey(edge.source, edge.target));
    const dagrePoints: Position[] =
      layoutOk && repId
        ? (g.edge(edge.source, edge.target, repId)?.points ?? []).map((p: Position) => ({
            x: p.x,
            y: p.y,
          }))
        : [];
    const touchesPin = pinned[edge.source] !== undefined || pinned[edge.target] !== undefined;
    if (touchesPin || dagrePoints.length < 2) {
      routes[edge.id] = straightRoute(source, target);
    } else {
      routes[edge.id] = { points: dagrePoints };
    }
  }
  return { nodes: boxes, edges: routes };
}
