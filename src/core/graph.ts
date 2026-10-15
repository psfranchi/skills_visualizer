import { edgeId, nodeId } from './ids';
import { basename, dirname, type RepoPath, ROOT_DIR } from './paths';
import {
  type AgentEdge,
  type AgentGraph,
  type AgentNode,
  type Evidence,
  type FileSourceCapabilities,
  type GraphDiagnostic,
  type LinkKind,
  type Relation,
  SCHEMA_VERSION,
  type SourceLocation,
} from './schema';

/** Where an adapter-produced edge points before resolution against the file set. */
export type EdgeTarget =
  | { kind: 'node'; id: string }
  | {
      kind: 'path';
      /** Text as written in the source, for diagnostics. */
      raw: string;
      /** Tried in order; the first that exists wins. Empty when the raw target escapes the root. */
      candidates: readonly RepoPath[];
      onMissing: 'diagnose' | 'ignore';
      /** Emit an info diagnostic when more than one candidate exists. */
      diagnoseAmbiguity?: boolean;
      /** When false, only files and node-owned paths match (no plain directory nodes). Default true. */
      allowDirectories?: boolean;
    };

export interface PendingEdge {
  source: string;
  target: EdgeTarget;
  relation: Relation;
  evidence: Evidence;
  /** Stable UI label tag; copied onto the resolved edge. */
  linkKind?: LinkKind;
  provenance?: SourceLocation;
  explanation: string;
  confidence?: number;
}

/** What one adapter `parse` call contributes. */
export interface GraphFragment {
  nodes: AgentNode[];
  edges: PendingEdge[];
  diagnostics: GraphDiagnostic[];
  /** Paths whose references should land on an existing node (e.g. a skill's `SKILL.md` and folder). */
  owners: { path: RepoPath; nodeId: string }[];
}

export interface BuildGraphInput {
  source: { id: string; capabilities: FileSourceCapabilities };
  generatedBy: { adapter: string; version: string };
  files: readonly RepoPath[];
  fragments: readonly GraphFragment[];
  diagnostics?: readonly GraphDiagnostic[];
  /** Content hashes for paths returned by `fileNodePaths`. */
  hashes: ReadonlyMap<RepoPath, string>;
}

const SCRIPT_EXTENSIONS = new Set(['sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd']);

function isScriptPath(path: RepoPath): boolean {
  if (path.split('/').slice(0, -1).includes('scripts')) return true;
  const name = basename(path);
  const dot = name.lastIndexOf('.');
  return dot > 0 && SCRIPT_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

type Resolved = { id: string; create?: { kind: 'file' | 'script' | 'directory'; path: RepoPath } };

class Resolver {
  readonly #files: Set<RepoPath>;
  readonly #dirs = new Set<RepoPath>([ROOT_DIR]);
  readonly #owners = new Map<RepoPath, string>();

  constructor(files: readonly RepoPath[], fragments: readonly GraphFragment[]) {
    this.#files = new Set(files);
    for (const file of files) {
      for (let dir = dirname(file); dir !== ROOT_DIR; dir = dirname(dir)) this.#dirs.add(dir);
    }
    for (const fragment of fragments) {
      for (const owner of fragment.owners) {
        if (!this.#owners.has(owner.path)) this.#owners.set(owner.path, owner.nodeId);
      }
    }
  }

  resolvePath(path: RepoPath): Resolved | null {
    const owner = this.#owners.get(path);
    if (owner) return { id: owner };
    if (this.#files.has(path)) {
      const kind = isScriptPath(path) ? 'script' : 'file';
      return { id: nodeId(kind, path), create: { kind, path } };
    }
    if (this.#dirs.has(path)) {
      return { id: nodeId('directory', path), create: { kind: 'directory', path } };
    }
    return null;
  }

  /** All existing candidates, in order. */
  resolveTarget(target: EdgeTarget): Resolved[] {
    if (target.kind === 'node') return [{ id: target.id }];
    const allowDirectories = target.allowDirectories ?? true;
    return target.candidates.flatMap((path) => {
      const resolved = this.resolvePath(path);
      if (!resolved || (!allowDirectories && resolved.create?.kind === 'directory')) return [];
      return [resolved];
    });
  }
}

/** Existing candidates in order; inferred edges never point back at their own source. */
function resolveCandidates(resolver: Resolver, edge: PendingEdge): Resolved[] {
  return resolver
    .resolveTarget(edge.target)
    .filter((c) => edge.evidence !== 'inferred' || c.id !== edge.source);
}

/** Paths that will become `file`/`script` nodes; the pipeline hashes these before `buildGraph`. */
export function fileNodePaths(
  files: readonly RepoPath[],
  fragments: readonly GraphFragment[],
): RepoPath[] {
  const resolver = new Resolver(files, fragments);
  const paths = new Set<RepoPath>();
  for (const fragment of fragments) {
    for (const edge of fragment.edges) {
      const [first] = resolveCandidates(resolver, edge);
      if (first?.create && first.create.kind !== 'directory') paths.add(first.create.path);
    }
  }
  return [...paths].sort();
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareDiagnostics(a: GraphDiagnostic, b: GraphDiagnostic): number {
  return (
    compareStrings(a.path ?? '', b.path ?? '') ||
    (a.span?.offset ?? -1) - (b.span?.offset ?? -1) ||
    compareStrings(a.code, b.code) ||
    compareStrings(a.nodeId ?? '', b.nodeId ?? '') ||
    compareStrings(a.message, b.message)
  );
}

function describeTarget(target: EdgeTarget): string {
  return target.kind === 'node' ? target.id : target.raw;
}

/** Strongly connected components with a cycle (size > 1 or a self-loop), via Tarjan. */
function findCycles(nodeIds: readonly string[], edges: readonly AgentEdge[]): string[][] {
  const adjacency = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  for (const edge of edges) adjacency.get(edge.source)?.push(edge.target);
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  let counter = 0;

  const visit = (id: string): void => {
    index.set(id, counter);
    low.set(id, counter);
    counter++;
    stack.push(id);
    onStack.add(id);
    for (const next of adjacency.get(id) ?? []) {
      if (!index.has(next)) {
        visit(next);
        low.set(id, Math.min(low.get(id) ?? 0, low.get(next) ?? 0));
      } else if (onStack.has(next)) {
        low.set(id, Math.min(low.get(id) ?? 0, index.get(next) ?? 0));
      }
    }
    if (low.get(id) !== index.get(id)) return;
    const component: string[] = [];
    let member: string | undefined;
    do {
      member = stack.pop();
      if (member === undefined) break;
      onStack.delete(member);
      component.push(member);
    } while (member !== id);
    const selfLoop = component.length === 1 && (adjacency.get(id) ?? []).includes(id);
    if (component.length > 1 || selfLoop) cycles.push(component.sort());
  };

  for (const id of nodeIds) if (!index.has(id)) visit(id);
  return cycles.sort((a, b) => compareStrings(a[0] ?? '', b[0] ?? ''));
}

/** Resolves pending edges, creates file/script/directory nodes, diagnoses gaps, and sorts everything. */
export function buildGraph(input: BuildGraphInput): AgentGraph {
  const resolver = new Resolver(input.files, input.fragments);
  const nodes = new Map<string, AgentNode>();
  const diagnostics: GraphDiagnostic[] = [...(input.diagnostics ?? [])];
  const adapter = input.generatedBy.adapter;

  for (const fragment of input.fragments) {
    diagnostics.push(...fragment.diagnostics);
    for (const node of fragment.nodes) {
      if (nodes.has(node.id)) {
        diagnostics.push({
          code: 'duplicate-node',
          message: `Node ${node.id} was discovered more than once; keeping the first.`,
          severity: 'warning',
          nodeId: node.id,
          ...(node.source ? { path: node.source.path } : {}),
        });
        continue;
      }
      nodes.set(node.id, node);
    }
  }

  const ensureNode = (create: NonNullable<Resolved['create']>): void => {
    if (nodes.has(nodeId(create.kind, create.path))) return;
    const hash = input.hashes.get(create.path);
    nodes.set(nodeId(create.kind, create.path), {
      id: nodeId(create.kind, create.path),
      kind: create.kind,
      name: create.path === ROOT_DIR ? ROOT_DIR : basename(create.path),
      ...(create.kind !== 'directory' && hash
        ? { source: { path: create.path, contentHash: hash, adapter } }
        : {}),
      attributes: { path: create.path, engine: 'shared' },
      diagnostics: [],
    });
  };

  const seen = new Set<string>();
  const unordered: Omit<AgentEdge, 'id'>[] = [];
  for (const fragment of input.fragments) {
    for (const pending of fragment.edges) {
      const candidates = resolveCandidates(resolver, pending);
      const [target] = candidates;
      const where = pending.provenance
        ? {
            path: pending.provenance.path,
            ...(pending.provenance.start ? { span: pending.provenance.start } : {}),
          }
        : {};
      if (!target) {
        if (pending.target.kind === 'path' && pending.target.onMissing === 'diagnose') {
          diagnostics.push({
            code: 'unresolved-reference',
            message: `Reference target not found: ${describeTarget(pending.target)}`,
            severity: 'warning',
            nodeId: pending.source,
            ...where,
          });
        }
        continue;
      }
      if (
        pending.target.kind === 'path' &&
        pending.target.diagnoseAmbiguity &&
        new Set(candidates.map((c) => c.id)).size > 1
      ) {
        diagnostics.push({
          code: 'ambiguous-reference',
          message: `"${pending.target.raw}" matches ${candidates.map((c) => c.id).join(' and ')}; using ${target.id}.`,
          severity: 'info',
          nodeId: pending.source,
          ...where,
        });
      }
      if (target.create) ensureNode(target.create);
      const key = [
        pending.relation,
        pending.source,
        target.id,
        pending.evidence,
        pending.provenance?.path ?? '',
        pending.provenance?.start?.offset ?? '',
      ].join('\u0000');
      if (seen.has(key)) continue;
      seen.add(key);
      unordered.push({
        source: pending.source,
        target: target.id,
        relation: pending.relation,
        evidence: pending.evidence,
        ...(pending.linkKind ? { linkKind: pending.linkKind } : {}),
        ...(pending.provenance ? { provenance: pending.provenance } : {}),
        explanation: pending.explanation,
        ...(pending.confidence === undefined ? {} : { confidence: pending.confidence }),
        supportedOperations: [],
      });
    }
  }

  unordered.sort(
    (a, b) =>
      compareStrings(a.relation, b.relation) ||
      compareStrings(a.source, b.source) ||
      compareStrings(a.target, b.target) ||
      compareStrings(a.provenance?.path ?? '', b.provenance?.path ?? '') ||
      (a.provenance?.start?.offset ?? -1) - (b.provenance?.start?.offset ?? -1) ||
      compareStrings(a.evidence, b.evidence) ||
      compareStrings(a.explanation, b.explanation),
  );
  const ordinals = new Map<string, number>();
  const edges: AgentEdge[] = unordered.map((edge) => {
    const group = `${edge.relation}:${edge.source}->${edge.target}`;
    const ordinal = ordinals.get(group) ?? 0;
    ordinals.set(group, ordinal + 1);
    return { id: edgeId(edge.relation, edge.source, edge.target, ordinal), ...edge };
  });
  edges.sort((a, b) => compareStrings(a.id, b.id));

  const sortedNodeIds = [...nodes.keys()].sort();
  const explicitRefs = edges.filter(
    (e) => e.relation === 'references' && e.evidence === 'explicit',
  );
  for (const cycle of findCycles(sortedNodeIds, explicitRefs)) {
    const [first] = cycle;
    if (first === undefined) continue;
    const path = nodes.get(first)?.source?.path;
    diagnostics.push({
      code: 'reference-cycle',
      message: `Reference cycle (informational): ${cycle.join(', ')}`,
      severity: 'info',
      nodeId: first,
      ...(path ? { path } : {}),
    });
  }

  diagnostics.sort(compareDiagnostics);
  const codesByNode = new Map<string, Set<string>>();
  for (const diagnostic of diagnostics) {
    if (!diagnostic.nodeId) continue;
    const codes = codesByNode.get(diagnostic.nodeId) ?? new Set<string>();
    codes.add(diagnostic.code);
    codesByNode.set(diagnostic.nodeId, codes);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    source: input.source,
    generatedBy: input.generatedBy,
    nodes: sortedNodeIds.map((id) => {
      const node = nodes.get(id) as AgentNode;
      return { ...node, diagnostics: [...(codesByNode.get(id) ?? [])].sort() };
    }),
    edges,
    diagnostics,
  };
}
