export type DocViewMode = 'preview' | 'source';

/** Markdown / MDX Cursor rule files get a Preview | Source toggle. */
export function isMarkdownPath(path: string): boolean {
  return /\.mdc?$/i.test(path);
}

/**
 * Rich markdown preview is allowed only for markdown paths that were not
 * re-serialized without secrets (`redacted`). Secret-bearing paths are never
 * served as rich preview material.
 */
export function canRichMarkdownPreview(path: string, file: { redacted: boolean }): boolean {
  return isMarkdownPath(path) && !file.redacted;
}

export function initialDocViewMode(canPreview: boolean): DocViewMode {
  return canPreview ? 'preview' : 'source';
}
