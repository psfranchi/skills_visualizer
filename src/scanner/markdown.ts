import remarkFrontmatter from 'remark-frontmatter';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { parseDocument } from 'yaml';

/** Half-open UTF-16 range `[start, end)` into the decoded text. */
export interface Range {
  start: number;
  end: number;
}

export interface MarkdownLink extends Range {
  kind: 'link' | 'image' | 'definition';
  /** URL as written. */
  url: string;
}

export interface InlineCode extends Range {
  value: string;
}

export type Frontmatter =
  | { status: 'none' }
  | { status: 'ok'; data: Record<string, unknown>; range: Range }
  | { status: 'invalid'; message: string; errorOffset: number; range: Range };

export interface MarkdownDoc {
  frontmatter: Frontmatter;
  links: MarkdownLink[];
  inlineCode: InlineCode[];
  /** Raw ranges of prose text nodes (excludes code, frontmatter, link URLs). */
  textRanges: Range[];
}

const processor = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']);

type MdNode =
  | ReturnType<typeof processor.parse>
  | ReturnType<typeof processor.parse>['children'][number];

function rangeOf(node: MdNode): Range | null {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start === undefined || end === undefined ? null : { start, end };
}

function parseFrontmatter(text: string, node: MdNode): Frontmatter {
  const range = rangeOf(node);
  if (!range) return { status: 'none' };
  const valueStart = text.indexOf('\n', range.start) + 1;
  const raw = text.slice(valueStart, Math.max(valueStart, range.end - 3));
  const doc = parseDocument(raw, { prettyErrors: false });
  const [error] = doc.errors;
  if (error) {
    return {
      status: 'invalid',
      message: error.message,
      errorOffset: valueStart + error.pos[0],
      range,
    };
  }
  let data: unknown;
  try {
    data = doc.toJS({ maxAliasCount: 100 }) ?? {};
  } catch (toJsError) {
    const message =
      toJsError instanceof Error ? toJsError.message : 'Frontmatter could not be read';
    return { status: 'invalid', message, errorOffset: valueStart, range };
  }
  if (typeof data !== 'object' || Array.isArray(data) || data === null) {
    return {
      status: 'invalid',
      message: 'Frontmatter is not a mapping',
      errorOffset: valueStart,
      range,
    };
  }
  return { status: 'ok', data: data as Record<string, unknown>, range };
}

/** Parses Markdown with optional YAML frontmatter. Offsets are absolute in `text`. */
export function parseMarkdown(text: string): MarkdownDoc {
  const doc: MarkdownDoc = {
    frontmatter: { status: 'none' },
    links: [],
    inlineCode: [],
    textRanges: [],
  };
  const visit = (node: MdNode): void => {
    const range = rangeOf(node);
    switch (node.type) {
      case 'yaml':
        doc.frontmatter = parseFrontmatter(text, node);
        return;
      case 'link':
      case 'image':
      case 'definition':
        if (range) doc.links.push({ kind: node.type, url: node.url, ...range });
        break;
      case 'inlineCode':
        if (range) doc.inlineCode.push({ value: node.value, ...range });
        return;
      case 'text':
        if (range) doc.textRanges.push(range);
        return;
      case 'code':
      case 'html':
        return;
    }
    if ('children' in node) for (const child of node.children) visit(child as MdNode);
  };
  visit(processor.parse(text));
  return doc;
}

/**
 * Line-based `key: value` fallback for rule frontmatter that is not strict YAML
 * (Cursor writes e.g. `globs: *.ts`, which YAML reads as an alias).
 */
export function parseLenientFrontmatter(text: string, range: Range): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const body = text.slice(
    text.indexOf('\n', range.start) + 1,
    Math.max(range.start, range.end - 3),
  );
  for (const line of body.split(/\r?\n/)) {
    const match = /^([A-Za-z_][\w-]*):(.*)$/s.exec(line);
    if (!match?.[1]) continue;
    const value = (match[2] ?? '').trim();
    if (value === 'true' || value === 'false') data[match[1]] = value === 'true';
    else if (value === '') data[match[1]] = null;
    else data[match[1]] = value.replace(/^(['"])(.*)\1$/, '$2');
  }
  return data;
}
