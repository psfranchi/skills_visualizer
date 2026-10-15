import { EVIDENCE, type Evidence } from '../core';

const DESCRIPTIONS: Record<Evidence, string> = {
  explicit: 'Declared in a source file (link, @mention, mcp.json entry)',
  derived: 'Follows from file layout (folder contains file, AGENTS.md scope)',
  inferred: 'Heuristic guess (inline-code path); hidden by default',
  annotation: 'User annotation',
};

export function Legend() {
  return (
    <section className="legend" aria-label="Edge evidence legend">
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
    </section>
  );
}
