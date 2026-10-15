import { describe, expect, it } from 'vitest';
import type { Position } from '../core';
import { type Box, boxBoundaryPoint, type LayoutGraph, layoutHierarchy, nodeSize } from './dagre';

const EPSILON = 0.5;

function onOrInside(box: Box, point: Position): boolean {
  return (
    Math.abs(point.x - box.x) <= box.w / 2 + EPSILON &&
    Math.abs(point.y - box.y) <= box.h / 2 + EPSILON
  );
}

function graphOf(nodes: string[], edges: [string, string, string][]): LayoutGraph {
  return {
    nodes: nodes.map((id) => ({ id, name: id })),
    edges: edges.map(([id, source, target]) => ({ id, source, target })),
  };
}

function expectEndpointsOnBoxes(graph: LayoutGraph, result: ReturnType<typeof layoutHierarchy>) {
  for (const edge of graph.edges) {
    const route = result.edges[edge.id];
    const source = result.nodes[edge.source];
    const target = result.nodes[edge.target];
    if (!route || !source || !target) throw new Error(`missing layout for ${edge.id}`);
    expect(route.points.length, edge.id).toBeGreaterThanOrEqual(2);
    for (const p of route.points) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y), edge.id).toBe(true);
    }
    const first = route.points[0];
    const last = route.points.at(-1);
    if (!first || !last) throw new Error('unreachable');
    expect(onOrInside(source, first), `${edge.id} starts on its source`).toBe(true);
    expect(onOrInside(target, last), `${edge.id} ends on its target`).toBe(true);
  }
}

function overlaps(a: Box, b: Box): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}

describe('layoutHierarchy', () => {
  it('places disconnected nodes without overlap', () => {
    const graph = graphOf(['a', 'b', 'c'], []);
    const result = layoutHierarchy(graph);
    const boxes = Object.values(result.nodes);
    expect(boxes).toHaveLength(3);
    for (const box of boxes) {
      expect(Number.isFinite(box.x) && Number.isFinite(box.y)).toBe(true);
      expect(box.w).toBe(nodeSize('a').width);
    }
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
    }
  });

  it('routes cycles, multi-edges, and self-loops onto node boxes', () => {
    const graph = graphOf(
      ['a', 'b', 'c'],
      [
        ['ab#0', 'a', 'b'],
        ['ab#1', 'a', 'b'],
        ['bc', 'b', 'c'],
        ['ca', 'c', 'a'],
        ['aa', 'a', 'a'],
      ],
    );
    const result = layoutHierarchy(graph);
    expect(Object.keys(result.edges).sort()).toEqual(['aa', 'ab#0', 'ab#1', 'bc', 'ca']);
    expectEndpointsOnBoxes(graph, result);
  });

  it('applies pinned positions and draws edges touching them straight', () => {
    const graph = graphOf(
      ['a', 'b', 'c'],
      [
        ['ab', 'a', 'b'],
        ['bc', 'b', 'c'],
        ['bb', 'b', 'b'],
      ],
    );
    const result = layoutHierarchy(graph, { pinned: { b: { x: 1000, y: -500 } } });
    expect(result.nodes.b).toMatchObject({ x: 1000, y: -500 });
    expect(result.edges.ab?.points).toHaveLength(2);
    expect(result.edges.bc?.points).toHaveLength(2);
    expectEndpointsOnBoxes(graph, result);
  });

  it('lays out only visible nodes and edges', () => {
    const graph = graphOf(
      ['a', 'b', 'c'],
      [
        ['ab', 'a', 'b'],
        ['bc', 'b', 'c'],
        ['ab2', 'a', 'b'],
      ],
    );
    const result = layoutHierarchy(graph, {
      visibleIds: new Set(['a', 'b']),
      visibleEdgeIds: new Set(['ab', 'bc']),
    });
    expect(Object.keys(result.nodes).sort()).toEqual(['a', 'b']);
    expect(Object.keys(result.edges)).toEqual(['ab']);
  });

  it('ignores pins for nodes that are not visible', () => {
    const graph = graphOf(['a'], []);
    const result = layoutHierarchy(graph, { pinned: { gone: { x: 1, y: 2 } } });
    expect(Object.keys(result.nodes)).toEqual(['a']);
  });
});

describe('boxBoundaryPoint', () => {
  const box = { x: 0, y: 0, w: 100, h: 40 };

  it('clips toward the target onto the border', () => {
    expect(boxBoundaryPoint(box, { x: 500, y: 0 })).toEqual({ x: 50, y: 0 });
    expect(boxBoundaryPoint(box, { x: 0, y: -300 })).toEqual({ x: 0, y: -20 });
  });

  it('returns the center for coincident or inside points', () => {
    expect(boxBoundaryPoint(box, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(boxBoundaryPoint(box, { x: 10, y: 5 })).toEqual({ x: 10, y: 5 });
  });
});
