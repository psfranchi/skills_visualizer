// Scan pipeline, Markdown/frontmatter parsing, client adapters.

export type * from './adapter';
export { cursorAdapter, redactMcpConfigText } from './adapters/cursor';
export { scan } from './scan';

export const SUPPORTED_ADAPTERS = ['cursor'] as const;
