import { NODE_KINDS, type NodeKind, SEVERITIES, type Severity } from '../core';
import type { Filters } from './model';

interface ToolbarProps {
  title: string;
  filters: Filters;
  kindCounts: ReadonlyMap<NodeKind, number>;
  busy: boolean;
  onFilters(filters: Filters): void;
  onFit(): void;
  onResetLayout(): void;
  onRescan(): void;
}

function toggle<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function Toolbar({
  title,
  filters,
  kindCounts,
  busy,
  onFilters,
  onFit,
  onResetLayout,
  onRescan,
}: ToolbarProps) {
  const kinds = NODE_KINDS.filter((kind) => (kindCounts.get(kind) ?? 0) > 0);
  return (
    <header className="toolbar">
      <h1 className="toolbar-title">{title}</h1>
      <input
        type="search"
        className="toolbar-search"
        placeholder="Search nodes…"
        aria-label="Search nodes"
        value={filters.search}
        onChange={(event) => onFilters({ ...filters, search: event.target.value })}
      />
      <fieldset className="toolbar-group">
        <legend>Kinds</legend>
        {kinds.map((kind) => (
          <label key={kind} className={`chip kind-${kind}`}>
            <input
              type="checkbox"
              checked={filters.kinds.has(kind)}
              onChange={() => onFilters({ ...filters, kinds: toggle(filters.kinds, kind) })}
            />
            {kind} <span className="count">{kindCounts.get(kind)}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="toolbar-group">
        <legend>Diagnostics</legend>
        {SEVERITIES.map((severity: Severity) => (
          <label key={severity} className={`chip severity-${severity}`}>
            <input
              type="checkbox"
              checked={filters.severities.has(severity)}
              onChange={() =>
                onFilters({ ...filters, severities: toggle(filters.severities, severity) })
              }
            />
            {severity}
          </label>
        ))}
      </fieldset>
      <label className="chip">
        <input
          type="checkbox"
          checked={filters.showInferred}
          onChange={(event) => onFilters({ ...filters, showInferred: event.target.checked })}
        />
        Show inferred edges
      </label>
      <div className="toolbar-actions">
        <button type="button" onClick={onFit}>
          Fit
        </button>
        <button type="button" onClick={onResetLayout}>
          Reset layout
        </button>
        <button type="button" onClick={onRescan} disabled={busy}>
          {busy ? 'Scanning…' : 'Rescan'}
        </button>
      </div>
    </header>
  );
}
