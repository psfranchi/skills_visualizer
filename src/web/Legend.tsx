import { EVIDENCE, type Evidence } from '../core';
import { EDGE_LABEL_LEGEND } from './edge-labels';

const DESCRIPTIONS: Record<Evidence, string> = {
  explicit: 'Declared in a source file (link, @mention, mcp.json entry)',
  derived: 'Follows from file layout, scope, or glob/paths match',
  inferred: 'Heuristic guess (inline-code path); hidden by default',
  annotation: 'User annotation',
};

export function Legend() {
  return (
    <section className="legend" aria-label="Graph legend">
      <h2>Evidence</h2>
      <ul>
        {EVIDENCE.map((evidence) => (
          <li key={evidence} title={DESCRIPTIONS[evidence]}>
            <svg width="36" height="10" aria-hidden="true">
              <line className={`edge evidence-${evidence}`} x1="2" y1="5" x2="34" y2="5" />
            </svg>
            <span>{evidence}</span>
          </li>
        ))}
      </ul>
      <h2>Edge kinds</h2>
      <ul className="edge-kind-list">
        {EDGE_LABEL_LEGEND.map((item) => (
          <li key={item.kind} title={item.hint}>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
