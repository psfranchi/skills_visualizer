import type { ConfigRoot } from './adapter';

/** First-class engine tags on every graph node. */
export const ENGINES = ['cursor', 'claude', 'codex', 'shared'] as const;
export type Engine = (typeof ENGINES)[number];

/** UI filter chips (excludes `shared`, which always shows when its kinds are on). */
export const ENGINE_FILTERS = ['cursor', 'claude', 'codex'] as const;
export type EngineFilter = (typeof ENGINE_FILTERS)[number];

export const ENGINE_LABELS: Record<Engine, string> = {
  cursor: 'Cursor',
  claude: 'Claude',
  codex: 'Codex',
  shared: 'Shared',
};

/** Map a discovery root directory to an engine. */
export function engineForRoot(root: ConfigRoot | undefined): Engine {
  switch (root) {
    case '.cursor':
      return 'cursor';
    case '.claude':
      return 'claude';
    case '.codex':
      return 'codex';
    case '.agents':
      return 'shared';
    default:
      return 'shared';
  }
}

/** Precedence for name-collision diagnostics (lower index wins). */
export const ROOT_PRECEDENCE: readonly ConfigRoot[] = ['.cursor', '.claude', '.codex', '.agents'];
