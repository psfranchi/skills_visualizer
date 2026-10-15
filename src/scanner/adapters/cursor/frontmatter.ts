import type { GraphDiagnostic } from '../../../core';
import type { MarkdownDoc } from '../../markdown';
import { parseLenientFrontmatter } from '../../markdown';
import type { ReferenceContext } from '../../references';

export const KNOWN_FIELDS = {
  rule: ['description', 'globs', 'alwaysApply'],
  skill: [
    'name',
    'description',
    'paths',
    'globs',
    'disable-model-invocation',
    'icon',
    'color',
    'metadata',
    'license',
    'compatibility',
    'allowed-tools',
  ],
  agent: ['name', 'description', 'model', 'readonly', 'is_background'],
} as const;

export interface FrontmatterResult {
  data: Record<string, unknown>;
  present: boolean;
  /** False when the frontmatter could not be read at all. */
  valid: boolean;
  diagnostics: GraphDiagnostic[];
}

/**
 * Reads frontmatter. Invalid YAML is an error, except for rules, which fall back to
 * line-based `key: value` parsing (Cursor's `.mdc` frontmatter is not strict YAML).
 */
export function readFrontmatter(
  doc: MarkdownDoc,
  ctx: ReferenceContext,
  options: { lenient: boolean },
): FrontmatterResult {
  const fm = doc.frontmatter;
  if (fm.status === 'none') return { data: {}, present: false, valid: true, diagnostics: [] };
  if (fm.status === 'ok') return { data: fm.data, present: true, valid: true, diagnostics: [] };
  const where = { path: ctx.file.path, span: ctx.locate(fm.errorOffset), nodeId: ctx.sourceNodeId };
  if (options.lenient) {
    return {
      data: parseLenientFrontmatter(ctx.file.text, fm.range),
      present: true,
      valid: true,
      diagnostics: [
        {
          code: 'frontmatter-not-yaml',
          message: `Frontmatter is not strict YAML (${fm.message}); read as plain key: value lines.`,
          severity: 'info',
          ...where,
        },
      ],
    };
  }
  return {
    data: {},
    present: true,
    valid: false,
    diagnostics: [
      {
        code: 'malformed-frontmatter',
        message: `Frontmatter is not valid YAML: ${fm.message}`,
        severity: 'error',
        ...where,
      },
    ],
  };
}

export function unknownFieldDiagnostics(
  data: Record<string, unknown>,
  known: readonly string[],
  ctx: ReferenceContext,
): GraphDiagnostic[] {
  const unknown = Object.keys(data)
    .filter((key) => !known.includes(key))
    .sort();
  if (unknown.length === 0) return [];
  return [
    {
      code: 'unknown-frontmatter-field',
      message: `Fields not defined by Cursor or the Agent Skills spec (kept as attributes): ${unknown.join(', ')}`,
      severity: 'info',
      path: ctx.file.path,
      nodeId: ctx.sourceNodeId,
    },
  ];
}

export function stringField(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

export function booleanField(data: Record<string, unknown>, key: string): boolean | undefined {
  const value = data[key];
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 'false') return value === 'true';
  return undefined;
}
