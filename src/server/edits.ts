import {
  type AgentGraph,
  decodeUtf8Strict,
  type FileSource,
  type GraphDiagnostic,
  OverlayFileSource,
  type ReplaceResult,
  type RepoPath,
  sha256Hex,
  type WritableFileSource,
} from '../core';
import { scan } from '../scanner';
import {
  edgeImpact,
  isEditableSkill,
  planReplace,
  unifiedDiff,
  validateSkillBytes,
} from '../source-editing';

export interface EditInput {
  path: RepoPath;
  expectedHash: string;
  newText: string;
}

export interface EditPreviewResult {
  diff: string;
  diagnostics: GraphDiagnostic[];
  impact: { edgesAdded: string[]; edgesRemoved: string[] };
  blocking: boolean;
}

export type EditFailure =
  | { status: 400; message: string; diagnostics?: GraphDiagnostic[] }
  | { status: 403; message: string }
  | { status: 404; message: string }
  | { status: 409; currentHash: string };

export type PreviewOutcome =
  | { ok: true; preview: EditPreviewResult }
  | ({ ok: false } & EditFailure);

export type ApplyOutcome =
  | { ok: true; hash: string; graph: AgentGraph }
  | ({ ok: false } & EditFailure);

function isWritable(source: FileSource): source is WritableFileSource {
  return (
    source.capabilities.write &&
    typeof (source as WritableFileSource).replaceIfUnchanged === 'function'
  );
}

/** True when the graph + listing say this path is a discovered editable SKILL.md. */
export async function pathIsEditableSkill(source: FileSource, path: RepoPath): Promise<boolean> {
  const [graph, paths] = await Promise.all([scan(source), source.list()]);
  return isEditableSkill(graph, path, paths);
}

async function currentBytes(
  source: FileSource,
  path: RepoPath,
  expectedHash: string,
): Promise<{ bytes: Uint8Array } | EditFailure> {
  const bytes = await source.read(path);
  if (!bytes) return { status: 404, message: 'File not readable' };
  const currentHash = await sha256Hex(bytes);
  if (currentHash !== expectedHash) return { status: 409, currentHash };
  return { bytes };
}

export async function previewEdit(source: FileSource, input: EditInput): Promise<PreviewOutcome> {
  if (!source.capabilities.write) return { ok: false, status: 403, message: 'Source is read-only' };
  const paths = await source.list();
  const graph = await scan(source);
  if (!isEditableSkill(graph, input.path, paths)) {
    return { ok: false, status: 403, message: 'Path is not an editable skill' };
  }
  const current = await currentBytes(source, input.path, input.expectedHash);
  if ('status' in current) return { ok: false, ...current };

  let plan: ReturnType<typeof planReplace>;
  try {
    plan = planReplace(current.bytes, input.newText);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      message: error instanceof Error ? error.message : 'Invalid edit',
    };
  }
  if (plan.bytes.byteLength > 1024 * 1024) {
    return { ok: false, status: 400, message: 'Edited file would exceed the size limit' };
  }

  const validation = await validateSkillBytes(input.path, plan.bytes, paths);
  const decoded = decodeUtf8Strict(current.bytes);
  const beforeText = decoded.ok ? decoded.text : '';
  const after = await scan(new OverlayFileSource(source, new Map([[input.path, plan.bytes]])));
  return {
    ok: true,
    preview: {
      diff: unifiedDiff(input.path, beforeText, plan.text),
      diagnostics: validation.diagnostics,
      impact: edgeImpact(graph, after),
      blocking: validation.blocking,
    },
  };
}

export async function applyEdit(source: FileSource, input: EditInput): Promise<ApplyOutcome> {
  if (!isWritable(source)) return { ok: false, status: 403, message: 'Source is read-only' };
  const paths = await source.list();
  const graph = await scan(source);
  if (!isEditableSkill(graph, input.path, paths)) {
    return { ok: false, status: 403, message: 'Path is not an editable skill' };
  }
  const current = await currentBytes(source, input.path, input.expectedHash);
  if ('status' in current) return { ok: false, ...current };

  let plan: ReturnType<typeof planReplace>;
  try {
    plan = planReplace(current.bytes, input.newText);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      message: error instanceof Error ? error.message : 'Invalid edit',
    };
  }
  if (plan.bytes.byteLength > 1024 * 1024) {
    return { ok: false, status: 400, message: 'Edited file would exceed the size limit' };
  }

  const validation = await validateSkillBytes(input.path, plan.bytes, paths);
  if (validation.blocking) {
    return {
      ok: false,
      status: 400,
      message: 'Edit has blocking diagnostics',
      diagnostics: validation.diagnostics,
    };
  }

  const replaced: ReplaceResult = await source.replaceIfUnchanged(
    input.path,
    input.expectedHash,
    plan.bytes,
  );
  if (!replaced.ok) {
    if (replaced.reason === 'conflict') {
      return {
        ok: false,
        status: 409,
        currentHash: replaced.currentHash ?? (await sha256Hex(current.bytes)),
      };
    }
    return { ok: false, status: 404, message: 'File not writable' };
  }

  const nextGraph = await scan(source);
  return { ok: true, hash: replaced.hash, graph: nextGraph };
}
