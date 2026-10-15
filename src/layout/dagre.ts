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

export const NODE_HEIGHT = 44;
const CHAR_WIDTH = 7;
const MIN_WIDTH = 96;
const MAX_WIDTH = 280;

export function nodeSize(name: string): { width: number; height: number } {
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, name.length * CHAR_WIDTH + 40));
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

/** Hierarchical (left → right) layout with Dagre; multi-edges and self-loops are kept. */
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
  for (const edge of edges) g.setEdge(edge.source, edge.target, {}, edge.id);
  dagre.layout(g);

  const boxes: Record<string, Box> = {};
  for (const node of nodes) {
    const label = g.node(node.id);
    const box = { x: label.x ?? 0, y: label.y ?? 0, w: label.width, h: label.height };
    const pin = pinned[node.id];
    boxes[node.id] = pin ? { ...box, x: pin.x, y: pin.y } : box;
  }

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
    const dagrePoints: Position[] = (g.edge(edge.source, edge.target, edge.id)?.points ?? []).map(
      (p: Position) => ({ x: p.x, y: p.y }),
    );
    const touchesPin = pinned[edge.source] !== undefined || pinned[edge.target] !== undefined;
    if (touchesPin || dagrePoints.length < 2) {
      routes[edge.id] = straightRoute(source, target);
    } else {
      routes[edge.id] = { points: dagrePoints };
    }
  }
  return { nodes: boxes, edges: routes };
}
