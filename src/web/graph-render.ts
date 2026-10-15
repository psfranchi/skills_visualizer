import { curveBasis, drag, line, type Selection, select } from 'd3';
import type { AgentEdge, AgentNode, Position, Severity } from '../core';
import { type Box, type LayoutResult, straightRoute } from '../layout';
import { activationLabel } from './activation';
import { edgeLabel } from './edge-labels';
import { nodeEngine } from './model';

export interface RenderInput {
  nodes: readonly AgentNode[];
  edges: readonly AgentEdge[];
  layout: LayoutResult;
  matches: ReadonlySet<string> | null;
  /** When set, nodes outside this set (and edges touching them) are dimmed. */
  focusIds: ReadonlySet<string> | null;
  selectedId: string | null;
  severities: ReadonlyMap<string, Severity>;
}

export interface RenderCallbacks {
  onSelect(id: string): void;
  onPin(id: string, position: Position): void;
}

interface NodeDatum {
  node: AgentNode;
  box: Box;
}

interface EdgeDatum {
  edge: AgentEdge;
  points: Position[];
}

const pathOf = line<Position>()
  .x((p) => p.x)
  .y((p) => p.y)
  .curve(curveBasis);

function truncate(text: string, box: Box): string {
  const max = Math.max(4, Math.floor((box.w - 16) / 7));
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Ensures the two layer groups exist inside the D3-owned root `<g>`. */
function layers(root: SVGGElement) {
  const g = select(root);
  if (g.select('g.edges').empty()) g.append('g').attr('class', 'edges');
  if (g.select('g.nodes').empty()) g.append('g').attr('class', 'nodes');
  return {
    edges: g.select<SVGGElement>('g.edges'),
    nodes: g.select<SVGGElement>('g.nodes'),
  };
}

/**
 * D3 data joins for edges and nodes. React never touches anything below `root`.
 * `callbacks` is read at event time so handlers bound on enter stay current.
 */
export function renderGraph(
  root: SVGGElement,
  input: RenderInput,
  callbacks: { current: RenderCallbacks },
): void {
  const { edges: edgeLayer, nodes: nodeLayer } = layers(root);
  const nodeData: NodeDatum[] = input.nodes.flatMap((node) => {
    const box = input.layout.nodes[node.id];
    return box ? [{ node, box }] : [];
  });
  const edgeData: EdgeDatum[] = input.edges.flatMap((edge) => {
    const route = input.layout.edges[edge.id];
    return route ? [{ edge, points: route.points }] : [];
  });
  /**
   * Focus wins over search for graph dimming: the selection neighborhood stays bright
   * even when a search query is active (search still filters the node list).
   */
  const dimmed = (id: string) => {
    if (input.focusIds !== null) return !input.focusIds.has(id);
    if (input.matches !== null) return !input.matches.has(id);
    return false;
  };

  const edgeSel = edgeLayer
    .selectAll<SVGPathElement, EdgeDatum>('path.edge')
    .data(edgeData, (d) => d.edge.id)
    .join((enter) => {
      const path = enter.append('path');
      path.append('title');
      return path;
    });
  edgeSel
    .attr('class', (d) => `edge evidence-${d.edge.evidence} relation-${d.edge.relation}`)
    .attr('d', (d) => pathOf(d.points))
    .attr('marker-end', (d) => `url(#arrow-${d.edge.evidence})`)
    .classed('dimmed', (d) => dimmed(d.edge.source) || dimmed(d.edge.target))
    .classed(
      'incident',
      (d) => input.selectedId !== null && [d.edge.source, d.edge.target].includes(input.selectedId),
    )
    .select('title')
    .text(
      (d) =>
        `${edgeLabel(d.edge)} · ${d.edge.relation} (${d.edge.evidence}): ${d.edge.explanation}`,
    );

  const nodeSel = nodeLayer
    .selectAll<SVGGElement, NodeDatum>('g.node')
    .data(nodeData, (d) => d.node.id)
    .join((enter) => {
      const g = enter.append('g');
      g.append('rect').attr('rx', 6);
      g.append('text').attr('class', 'label').attr('text-anchor', 'middle').attr('dy', '0.35em');
      g.append('circle').attr('class', 'severity').attr('r', 4);
      g.append('rect')
        .attr('class', 'activation-mark')
        .attr('width', 6)
        .attr('height', 6)
        .attr('rx', 1);
      g.append('title');
      g.on('click', (event: MouseEvent, d) => {
        event.stopPropagation();
        callbacks.current.onSelect(d.node.id);
      });
      g.call(dragBehavior(edgeLayer, callbacks));
      return g;
    });
  nodeSel
    .attr('class', (d) => {
      const activation = d.node.attributes.activation;
      const engine = nodeEngine(d.node);
      const parts = [`node`, `kind-${d.node.kind}`, `engine-${engine}`];
      if (typeof activation === 'string') parts.push(`activation-${activation}`);
      return parts.join(' ');
    })
    .classed('selected', (d) => d.node.id === input.selectedId)
    .classed('dimmed', (d) => dimmed(d.node.id))
    .attr('transform', (d) => `translate(${d.box.x},${d.box.y})`);
  nodeSel
    .select('rect:not(.activation-mark)')
    .attr('x', (d) => -d.box.w / 2)
    .attr('y', (d) => -d.box.h / 2)
    .attr('width', (d) => d.box.w)
    .attr('height', (d) => d.box.h);
  nodeSel.select('text.label').text((d) => truncate(d.node.name, d.box));
  nodeSel
    .select('rect.activation-mark')
    .attr('x', (d) => -d.box.w / 2 + 4)
    .attr('y', (d) => -d.box.h / 2 + 4)
    .attr('display', (d) => (activationLabel(d.node.attributes.activation) ? null : 'none'));
  nodeSel
    .select('circle.severity')
    .attr('cx', (d) => d.box.w / 2 - 8)
    .attr('cy', (d) => -d.box.h / 2 + 8)
    .attr('class', (d) => `severity severity-${input.severities.get(d.node.id) ?? 'none'}`);
  nodeSel.select('title').text((d) => {
    const activation = activationLabel(d.node.attributes.activation);
    return activation
      ? `${d.node.kind}: ${d.node.id} · ${activation}`
      : `${d.node.kind}: ${d.node.id}`;
  });
}

/** Movement below this many pixels is a click, not a drag. */
const CLICK_DISTANCE = 4;

/** Only a release past the click distance (total displacement since start) pins the node. */
export function shouldPin(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= CLICK_DISTANCE;
}

/** Dragging moves the node and its edges (drawn straight); release pins it. */
function dragBehavior(
  edgeLayer: Selection<SVGGElement, unknown, null, undefined>,
  callbacks: { current: RenderCallbacks },
) {
  let totalX = 0;
  let totalY = 0;
  return drag<SVGGElement, NodeDatum>()
    .clickDistance(CLICK_DISTANCE)
    .on('start', (event) => {
      totalX = 0;
      totalY = 0;
      event.sourceEvent?.stopPropagation();
    })
    .on('drag', function (event, d) {
      if (event.dx === 0 && event.dy === 0) return;
      totalX += event.dx;
      totalY += event.dy;
      d.box = { ...d.box, x: d.box.x + event.dx, y: d.box.y + event.dy };
      select(this).attr('transform', `translate(${d.box.x},${d.box.y})`);
      const boxes = new Map<string, Box>();
      select(this.parentNode as SVGGElement)
        .selectAll<SVGGElement, NodeDatum>('g.node')
        .each((n) => {
          boxes.set(n.node.id, n.box);
        });
      edgeLayer
        .selectAll<SVGPathElement, EdgeDatum>('path.edge')
        .filter((e) => e.edge.source === d.node.id || e.edge.target === d.node.id)
        .attr('d', (e) => {
          const source = boxes.get(e.edge.source);
          const target = boxes.get(e.edge.target);
          if (!source || !target || e.edge.source === e.edge.target) return pathOf(e.points);
          return pathOf(straightRoute(source, target).points);
        });
    })
    .on('end', (_event, d) => {
      if (shouldPin(totalX, totalY)) {
        callbacks.current.onPin(d.node.id, { x: d.box.x, y: d.box.y });
      }
    });
}

/** Bounding box of laid-out nodes, or null when empty. */
export function layoutBounds(
  layout: LayoutResult,
): { x: number; y: number; w: number; h: number } | null {
  const boxes = Object.values(layout.nodes);
  if (boxes.length === 0) return null;
  const minX = Math.min(...boxes.map((b) => b.x - b.w / 2));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w / 2));
  const minY = Math.min(...boxes.map((b) => b.y - b.h / 2));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h / 2));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
