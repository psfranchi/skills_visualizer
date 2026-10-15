import { decodeUtf8Strict, type GraphDiagnostic, type RepoPath, sha256Hex } from '../core';
import type { ClientAdapter } from '../scanner/adapter';
import { multiEngineAdapter } from '../scanner/adapters/multi';

export interface SkillValidation {
  diagnostics: GraphDiagnostic[];
  /** True when any diagnostic of severity `error` is attached to this path. */
  blocking: boolean;
}

/**
 * Reparse a planned skill file with the multi-engine adapter. Malformed YAML (and other errors)
 * block apply; Agent Skills / Cursor spec warnings do not.
 */
export async function validateSkillBytes(
  path: RepoPath,
  bytes: Uint8Array,
  allPaths: readonly RepoPath[],
  adapter: ClientAdapter = multiEngineAdapter,
): Promise<SkillValidation> {
  const decoded = decodeUtf8Strict(bytes);
  if (!decoded.ok) {
    const diagnostic: GraphDiagnostic = {
      code: 'undecodable-file',
      message: decoded.reason === 'binary' ? 'File looks binary.' : 'File is not valid UTF-8.',
      severity: 'error',
      path,
    };
    return { diagnostics: [diagnostic], blocking: true };
  }
  const { discovered, diagnostics: classifyDiagnostics } = adapter.classify(allPaths);
  const match = discovered.find((d) => d.path === path && adapter.editable(d));
  if (!match) {
    const diagnostic: GraphDiagnostic = {
      code: 'not-editable',
      message: 'Path is not an editable skill file.',
      severity: 'error',
      path,
    };
    return { diagnostics: [diagnostic], blocking: true };
  }
  const fragment = adapter.parse(match, {
    path,
    text: decoded.text,
    bom: decoded.bom,
    contentHash: await sha256Hex(bytes),
  });
  const diagnostics = [
    ...classifyDiagnostics.filter((d) => d.path === path),
    ...fragment.diagnostics.filter((d) => d.path === path || d.nodeId?.includes(path)),
  ];
  return {
    diagnostics,
    blocking: diagnostics.some((d) => d.severity === 'error'),
  };
}
