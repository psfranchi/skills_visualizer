// Scan pipeline, Markdown/frontmatter parsing, client adapters.

export type * from './adapter';
export { claudeAdapter } from './adapters/claude';
export { codexAdapter } from './adapters/codex';
export { cursorAdapter, redactMcpConfigText } from './adapters/cursor';
export { multiEngineAdapter } from './adapters/multi';
export { ENGINE_FILTERS, ENGINE_LABELS, ENGINES, type Engine, type EngineFilter } from './engine';
export { scan } from './scan';

export const SUPPORTED_ADAPTERS = ['cursor', 'claude', 'codex'] as const;
