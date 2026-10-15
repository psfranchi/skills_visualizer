import {
  type AgentNode,
  basename,
  type GraphDiagnostic,
  type GraphFragment,
  nodeId,
  type PendingEdge,
  type RepoPath,
  ROOT_DIR,
} from '../../../core';
import type { Discovered, LoadedFile } from '../../adapter';
import { parseMarkdown } from '../../markdown';
import {
  inlineCodeEdges,
  linkEdges,
  mentionEdges,
  type ReferenceContext,
  referenceContext,
} from '../../references';
import {
  booleanField,
  KNOWN_FIELDS,
  readFrontmatter,
  stringField,
  unknownFieldDiagnostics,
} from './frontmatter';

export const ADAPTER_ID = 'cursor';

const SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SKILL_NAME_MAX = 64;
const SKILL_DESCRIPTION_MAX = 1024;

function warning(ctx: ReferenceContext, code: string, message: string): GraphDiagnostic {
  return { code, message, severity: 'warning', path: ctx.file.path, nodeId: ctx.sourceNodeId };
}

function sourceOf(file: LoadedFile) {
  return { path: file.path, contentHash: file.contentHash, adapter: ADAPTER_ID };
}

function pathEdge(
  source: string,
  path: RepoPath,
  relation: PendingEdge['relation'],
  explanation: string,
): PendingEdge {
  return {
    source,
    target: { kind: 'path', raw: path, candidates: [path], onMissing: 'ignore' },
    relation,
    evidence: 'derived',
    explanation,
  };
}

function referenceEdges(
  ctx: ReferenceContext,
  doc: ReturnType<typeof parseMarkdown>,
  withMentions: boolean,
) {
  return [
    ...linkEdges(doc, ctx),
    ...inlineCodeEdges(doc, ctx),
    ...(withMentions ? mentionEdges(doc, ctx) : []),
  ];
}

export function parseInstruction(d: Discovered, file: LoadedFile): GraphFragment {
  const id = nodeId('instruction', d.path);
  const ctx = referenceContext(file, ADAPTER_ID, id);
  const doc = parseMarkdown(file.text);
  const fm = readFrontmatter(doc, ctx, { lenient: false });
  const node: AgentNode = {
    id,
    kind: 'instruction',
    name: d.path,
    source: sourceOf(file),
    attributes: { path: d.path, scope: d.scope },
    diagnostics: [],
  };
  return {
    nodes: [node],
    edges: [
      pathEdge(
        id,
        d.scope,
        'applies-to',
        'AGENTS.md applies to its directory and below; nested files combine with parents',
      ),
      ...referenceEdges(ctx, doc, false),
    ],
    diagnostics: fm.diagnostics,
    owners: [{ path: d.path, nodeId: id }],
  };
}

function parseGlobs(value: unknown): string[] {
  if (typeof value === 'string')
    return value
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);
  if (Array.isArray(value))
    return value.filter((g): g is string => typeof g === 'string' && g.trim() !== '');
  return [];
}

export type RuleActivation =
  | 'always-apply'
  | 'apply-to-specific-files'
  | 'apply-intelligently'
  | 'apply-manually';

export function ruleActivation(data: Record<string, unknown>): RuleActivation {
  if (booleanField(data, 'alwaysApply') === true) return 'always-apply';
  if (parseGlobs(data.globs).length > 0) return 'apply-to-specific-files';
  if (stringField(data, 'description')) return 'apply-intelligently';
  return 'apply-manually';
}

function rulesRelativeName(path: RepoPath): string {
  const marker = '.cursor/rules/';
  const index = path.indexOf(marker);
  const relative = index === -1 ? basename(path) : path.slice(index + marker.length);
  return relative.replace(/\.mdc$/, '');
}

export function parseRule(d: Discovered, file: LoadedFile): GraphFragment {
  const id = nodeId('rule', d.path);
  const ctx = referenceContext(file, ADAPTER_ID, id);
  const doc = parseMarkdown(file.text);
  const fm = readFrontmatter(doc, ctx, { lenient: true });
  const description = stringField(fm.data, 'description');
  const node: AgentNode = {
    id,
    kind: 'rule',
    name: rulesRelativeName(d.path),
    source: sourceOf(file),
    attributes: {
      path: d.path,
      root: d.root,
      scope: d.scope,
      activation: ruleActivation(fm.data),
      alwaysApply: booleanField(fm.data, 'alwaysApply') ?? false,
      globs: parseGlobs(fm.data.globs),
      ...(description ? { description } : {}),
      frontmatter: fm.data,
    },
    diagnostics: [],
  };
  return {
    nodes: [node],
    edges: referenceEdges(ctx, doc, true),
    diagnostics: [...fm.diagnostics, ...unknownFieldDiagnostics(fm.data, KNOWN_FIELDS.rule, ctx)],
    owners: [{ path: d.path, nodeId: id }],
  };
}

function skillChecks(
  ctx: ReferenceContext,
  folder: string,
  fm: ReturnType<typeof readFrontmatter>,
): GraphDiagnostic[] {
  if (!fm.present)
    return [
      warning(
        ctx,
        'skill-frontmatter-missing',
        'SKILL.md has no frontmatter; name and description are required.',
      ),
    ];
  if (!fm.valid) return [];
  const diagnostics: GraphDiagnostic[] = [];
  const name = fm.data.name;
  if (name === undefined || name === null || name === '') {
    diagnostics.push(warning(ctx, 'skill-name-missing', 'Skill frontmatter has no name.'));
  } else if (typeof name !== 'string') {
    diagnostics.push(warning(ctx, 'skill-name-invalid', 'Skill name must be a string.'));
  } else {
    if (!SKILL_NAME.test(name) || name.length > SKILL_NAME_MAX) {
      diagnostics.push(
        warning(
          ctx,
          'skill-name-invalid',
          `Skill name "${name}" must be lowercase letters, digits, and single hyphens (max ${SKILL_NAME_MAX}).`,
        ),
      );
    }
    if (name !== folder) {
      diagnostics.push(
        warning(
          ctx,
          'skill-name-mismatch',
          `Skill name "${name}" does not match its folder "${folder}".`,
        ),
      );
    }
  }
  const description = fm.data.description;
  if (typeof description !== 'string' || description.trim() === '') {
    diagnostics.push(
      warning(ctx, 'skill-description-missing', 'Skill frontmatter needs a non-empty description.'),
    );
  } else if (description.length > SKILL_DESCRIPTION_MAX) {
    diagnostics.push(
      warning(
        ctx,
        'skill-description-too-long',
        `Skill description is ${description.length} characters (max ${SKILL_DESCRIPTION_MAX}).`,
      ),
    );
  }
  return [...diagnostics, ...unknownFieldDiagnostics(fm.data, KNOWN_FIELDS.skill, ctx)];
}

/** Skill `paths`, with legacy `globs` fallback (Cursor). */
function skillPaths(data: Record<string, unknown>): string[] {
  const fromPaths = parseGlobs(data.paths);
  return fromPaths.length > 0 ? fromPaths : parseGlobs(data.globs);
}

export function parseSkill(d: Discovered, file: LoadedFile): GraphFragment {
  const skillDir = d.skillDir ?? d.path;
  const id = nodeId('skill', skillDir);
  const ctx = referenceContext(file, ADAPTER_ID, id);
  const doc = parseMarkdown(file.text);
  const fm = readFrontmatter(doc, ctx, { lenient: false });
  const folder = basename(skillDir);
  const description = stringField(fm.data, 'description');
  const nested = d.scope !== ROOT_DIR;
  const paths = skillPaths(fm.data);
  const node: AgentNode = {
    id,
    kind: 'skill',
    name: stringField(fm.data, 'name') ?? folder,
    source: sourceOf(file),
    attributes: {
      path: d.path,
      dir: skillDir,
      root: d.root,
      scope: d.scope,
      paths,
      ...(description ? { description } : {}),
      frontmatter: fm.data,
    },
    diagnostics: [],
  };
  const edges: PendingEdge[] = [
    ...(d.memberFiles ?? []).map((member) =>
      pathEdge(id, member, 'contains', 'File inside the skill folder'),
    ),
    ...referenceEdges(ctx, doc, false),
  ];
  if (nested) {
    edges.push(
      pathEdge(
        id,
        d.scope,
        'applies-to',
        `Skill root nested under ${d.scope} is scoped to that directory`,
      ),
    );
  }
  return {
    nodes: [node],
    edges,
    diagnostics: [...fm.diagnostics, ...skillChecks(ctx, folder, fm)],
    owners: [
      { path: d.path, nodeId: id },
      { path: skillDir, nodeId: id },
    ],
  };
}

export function parseAgent(d: Discovered, file: LoadedFile): GraphFragment {
  const id = nodeId('agent', d.path);
  const ctx = referenceContext(file, ADAPTER_ID, id);
  const doc = parseMarkdown(file.text);
  const fm = readFrontmatter(doc, ctx, { lenient: false });
  const description = stringField(fm.data, 'description');
  const node: AgentNode = {
    id,
    kind: 'agent',
    name: stringField(fm.data, 'name') ?? basename(d.path).replace(/\.md$/, ''),
    source: sourceOf(file),
    attributes: {
      path: d.path,
      root: d.root,
      scope: d.scope,
      model: stringField(fm.data, 'model') ?? 'inherit',
      readonly: booleanField(fm.data, 'readonly') ?? false,
      isBackground: booleanField(fm.data, 'is_background') ?? false,
      ...(description ? { description } : {}),
      frontmatter: fm.data,
    },
    diagnostics: [],
  };
  return {
    nodes: [node],
    edges: referenceEdges(ctx, doc, false),
    diagnostics: [...fm.diagnostics, ...unknownFieldDiagnostics(fm.data, KNOWN_FIELDS.agent, ctx)],
    owners: [{ path: d.path, nodeId: id }],
  };
}
