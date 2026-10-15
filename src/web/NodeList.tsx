import { type KeyboardEvent, useEffect, useRef } from 'react';
import type { AgentNode, Severity } from '../core';
import { stepSelection } from './model';

interface NodeListProps {
  nodes: readonly AgentNode[];
  selectedId: string | null;
  severities: ReadonlyMap<string, Severity>;
  onSelect(id: string): void;
}

const NAV_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

function optionId(id: string): string {
  return `node-option-${encodeURIComponent(id)}`;
}

/** Keyboard-accessible listbox (arrows, Home/End) synced with the graph selection. */
export function NodeList({ nodes, selectedId, severities, onSelect }: NodeListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedId) return;
    listRef.current
      ?.querySelector(`#${CSS.escape(optionId(selectedId))}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!NAV_KEYS.has(event.key)) return;
    event.preventDefault();
    const next = stepSelection(
      nodes.map((n) => n.id),
      selectedId,
      event.key as 'ArrowDown' | 'ArrowUp' | 'Home' | 'End',
    );
    if (next) onSelect(next);
  };

  const active = nodes.some((n) => n.id === selectedId) ? selectedId : null;
  return (
    <nav className="node-list" aria-label="Nodes">
      <h2>
        Nodes <span className="count">{nodes.length}</span>
      </h2>
      <div
        ref={listRef}
        className="options"
        role="listbox"
        aria-label="Graph nodes"
        tabIndex={0}
        aria-activedescendant={active ? optionId(active) : undefined}
        onKeyDown={onKeyDown}
      >
        {nodes.map((node) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the listbox (aria-activedescendant).
          <div
            key={node.id}
            id={optionId(node.id)}
            role="option"
            tabIndex={-1}
            aria-selected={node.id === selectedId}
            className={node.id === selectedId ? 'selected' : undefined}
            onClick={() => onSelect(node.id)}
            title={node.id}
          >
            <span className={`kind-badge kind-${node.kind}`}>{node.kind}</span>
            <span className="name">{node.name}</span>
            {severities.has(node.id) && (
              <span className={`severity-dot severity-${severities.get(node.id)}`} />
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}
