import {
  createSpanLocator,
  dirname,
  type PendingEdge,
  type RepoPath,
  ROOT_DIR,
  resolveRepoPath,
  type SourceLocation,
  type Span,
} from '../core';
import type { LoadedFile } from './adapter';
import type { MarkdownDoc, Range } from './markdown';

const URL_SCHEME = /^[A-Za-z][A-Za-z\d+.-]*:/;
const INFERRED_CONFIDENCE = 0.5;

export interface ReferenceContext {
  file: LoadedFile;
  adapter: string;
  sourceNodeId: string;
  locate: (offset: number) => Span;
}

export function referenceContext(
  file: LoadedFile,
  adapter: string,
  sourceNodeId: string,
): ReferenceContext {
  return { file, adapter, sourceNodeId, locate: createSpanLocator(file.text) };
}

export function provenance(ctx: ReferenceContext, range: Range): SourceLocation {
  return {
    path: ctx.file.path,
    start: ctx.locate(range.start),
    end: ctx.locate(range.end),
    contentHash: ctx.file.contentHash,
    adapter: ctx.adapter,
  };
}

function uniquePaths(paths: readonly (RepoPath | null)[]): RepoPath[] {
  return [...new Set(paths.filter((p): p is RepoPath => p !== null))];
}

/** Local link target with fragment/query stripped and percent-decoding applied; null for URLs and pure fragments. */
export function localLinkTarget(url: string): string | null {
  if (url === '' || url.startsWith('#') || url.startsWith('//') || URL_SCHEME.test(url))
    return null;
  const withoutSuffix = url.replace(/[?#].*$/, '');
  if (withoutSuffix === '') return null;
  try {
    return decodeURIComponent(withoutSuffix);
  } catch {
    return withoutSuffix;
  }
}

/** Markdown links/images/definitions → explicit `references` edges. */
export function linkEdges(doc: MarkdownDoc, ctx: ReferenceContext): PendingEdge[] {
  const fromDir = dirname(ctx.file.path);
  return doc.links.flatMap((link): PendingEdge[] => {
    const target = localLinkTarget(link.url);
    if (target === null) return [];
    return [
      {
        source: ctx.sourceNodeId,
        target: {
          kind: 'path',
          raw: link.url,
          candidates: uniquePaths([resolveRepoPath(fromDir, target)]),
          onMissing: 'diagnose',
        },
        relation: 'references',
        evidence: 'explicit',
        provenance: provenance(ctx, link),
        explanation: `Markdown ${link.kind} to "${link.url}"`,
      },
    ];
  });
}

/** Heuristic: inline code that could be a file path (no spaces, globs, or URL schemes). */
export function looksLikePath(value: string): boolean {
  if (value.length === 0 || value.length > 300) return false;
  if (!/^[\w.\-/~]+$/.test(value) || value.startsWith('-') || value.startsWith('~')) return false;
  if (/^\.+$/.test(value.replace(/\//g, ''))) return false;
  return value.includes('/') || /\.[A-Za-z0-9]+$/.test(value);
}

/** Inline-code paths → inferred `references` edges; dropped silently when nothing matches. */
export function inlineCodeEdges(doc: MarkdownDoc, ctx: ReferenceContext): PendingEdge[] {
  const fromDir = dirname(ctx.file.path);
  return doc.inlineCode.flatMap((code): PendingEdge[] => {
    if (!looksLikePath(code.value)) return [];
    return [
      {
        source: ctx.sourceNodeId,
        target: {
          kind: 'path',
          raw: code.value,
          candidates: uniquePaths([
            resolveRepoPath(fromDir, code.value),
            resolveRepoPath(ROOT_DIR, code.value),
          ]),
          onMissing: 'ignore',
          allowDirectories: false,
        },
        relation: 'references',
        evidence: 'inferred',
        provenance: provenance(ctx, code),
        explanation: `Inline code "${code.value}" matches an existing file; heuristic, not a declared reference`,
        confidence: INFERRED_CONFIDENCE,
      },
    ];
  });
}

const MENTION = /(?<![\w@/.`])@((?:\.{1,2}\/)?[\w.-]+(?:\/[\w.-]+)*)/g;
const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':']);

/** Strips sentence punctuation after a mention (`see @a/b.md.`). Char loop: `/[.,;:]+$/` is quadratic. */
export function trimTrailingPunctuation(value: string): string {
  let end = value.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(value.charAt(end - 1))) end--;
  return value.slice(0, end);
}

/**
 * Rule `@path` mentions in prose → explicit `references` edges.
 * Resolution base is not verified: repo root first, then relative to the rule; both existing → diagnostic.
 */
export function mentionEdges(doc: MarkdownDoc, ctx: ReferenceContext): PendingEdge[] {
  const fromDir = dirname(ctx.file.path);
  const edges: PendingEdge[] = [];
  for (const range of doc.textRanges) {
    const slice = ctx.file.text.slice(range.start, range.end);
    for (const match of slice.matchAll(MENTION)) {
      const raw = trimTrailingPunctuation(match[1] ?? '');
      if (!raw.includes('/') && !raw.includes('.')) continue;
      const start = range.start + (match.index ?? 0);
      edges.push({
        source: ctx.sourceNodeId,
        target: {
          kind: 'path',
          raw,
          candidates: uniquePaths([resolveRepoPath(ROOT_DIR, raw), resolveRepoPath(fromDir, raw)]),
          onMissing: 'diagnose',
          diagnoseAmbiguity: true,
        },
        relation: 'references',
        evidence: 'explicit',
        provenance: provenance(ctx, { start, end: start + 1 + raw.length }),
        explanation: `Rule @-mention "${raw}" (the agent reads the file; it is not inlined)`,
      });
    }
  }
  return edges;
}
