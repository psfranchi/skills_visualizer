import { NODE_KINDS, type NodeKind, SEVERITIES, type Severity } from '../core';
import { ENGINE_FILTERS, ENGINE_LABELS, type EngineFilter, type Filters } from './model';

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

function setEngine(filters: Filters, engine: EngineFilter | 'all', on: boolean): Filters {
  if (engine === 'all') return { ...filters, engines: 'all' };
  const current =
    filters.engines === 'all' ? new Set<EngineFilter>(ENGINE_FILTERS) : new Set(filters.engines);
  if (on) current.add(engine);
  else current.delete(engine);
  if (current.size === ENGINE_FILTERS.length) return { ...filters, engines: 'all' };
  return { ...filters, engines: current };
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
  const engineOn = (engine: EngineFilter) =>
    filters.engines === 'all' || filters.engines.has(engine);
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
        <legend>Engine</legend>
        <label className="chip engine-all">
          <input
            type="checkbox"
            checked={filters.engines === 'all'}
            onChange={() => onFilters({ ...filters, engines: 'all' })}
          />
          All
        </label>
        {ENGINE_FILTERS.map((engine) => (
          <label key={engine} className={`chip engine-${engine}`}>
            <input
              type="checkbox"
              checked={engineOn(engine)}
              onChange={(event) => onFilters(setEngine(filters, engine, event.target.checked))}
            />
            {ENGINE_LABELS[engine]}
          </label>
        ))}
      </fieldset>
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
      <label className="chip">
        <input
          type="checkbox"
          checked={filters.focusSelection}
          onChange={(event) => onFilters({ ...filters, focusSelection: event.target.checked })}
        />
        Focus selection
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
