import { select, type ZoomBehavior, zoom, zoomIdentity } from 'd3';
import { useEffect, useRef } from 'react';
import { EVIDENCE } from '../core';
import { layoutBounds, type RenderCallbacks, type RenderInput, renderGraph } from './graph-render';

interface GraphCanvasProps extends RenderInput, RenderCallbacks {
  /** Changing this value fits the graph into view. */
  fitToken: number;
}

const FIT_PADDING = 40;

/** React owns the `<svg>` and marker defs; D3 owns the inner `<g>` (joins, zoom, drag). */
export function GraphCanvas({ fitToken, onSelect, onPin, ...input }: GraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const rootRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const callbacks = useRef<RenderCallbacks>({ onSelect, onPin });
  callbacks.current = { onSelect, onPin };

  useEffect(() => {
    const svg = svgRef.current;
    const root = rootRef.current;
    if (!svg || !root) return;
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 4])
      .on('zoom', (event) => {
        select(root).attr('transform', event.transform.toString());
      });
    select(svg).call(behavior).on('dblclick.zoom', null);
    zoomRef.current = behavior;
    return () => {
      select(svg).on('.zoom', null);
    };
  }, []);

  useEffect(() => {
    if (rootRef.current) renderGraph(rootRef.current, input, callbacks);
  });

  const { layout } = input;
  // biome-ignore lint/correctness/useExhaustiveDependencies: fit only when asked (fitToken), not on every layout change.
  useEffect(() => {
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    const bounds = layoutBounds(layout);
    if (!svg || !behavior || !bounds) return;
    const { width, height } = svg.getBoundingClientRect();
    const scale = Math.min(
      2,
      (width - FIT_PADDING * 2) / Math.max(bounds.w, 1),
      (height - FIT_PADDING * 2) / Math.max(bounds.h, 1),
    );
    const transform = zoomIdentity
      .translate(width / 2, height / 2)
      .scale(Math.max(scale, 0.05))
      .translate(-(bounds.x + bounds.w / 2), -(bounds.y + bounds.h / 2));
    select(svg).call(behavior.transform, transform);
  }, [fitToken]);

  return (
    <svg ref={svgRef} className="graph-canvas" role="img" aria-label="Agent configuration graph">
      <defs>
        <filter id="node-depth" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow
            dx="0"
            dy="1"
            stdDeviation="1.25"
            floodColor="#1a2332"
            floodOpacity="0.16"
          />
        </filter>
        <filter id="node-focus" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#0f766e" floodOpacity="0.35" />
          <feDropShadow
            dx="0"
            dy="1"
            stdDeviation="1.25"
            floodColor="#1a2332"
            floodOpacity="0.12"
          />
        </filter>
        {EVIDENCE.map((evidence) => (
          <marker
            key={evidence}
            id={`arrow-${evidence}`}
            className={`arrow evidence-${evidence}`}
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        ))}
      </defs>
      <g ref={rootRef} />
    </svg>
  );
}
