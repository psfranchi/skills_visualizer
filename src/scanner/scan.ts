import {
  type AgentGraph,
  buildGraph,
  decodeUtf8Strict,
  type FileSource,
  fileNodePaths,
  type GraphDiagnostic,
  type GraphFragment,
  type RepoPath,
  sha256Hex,
} from '../core';
import type { ClientAdapter } from './adapter';
import { cursorAdapter } from './adapters/cursor';

/** Lists, classifies, parses, and builds the graph. Reads only; never writes or executes. */
export async function scan(
  source: FileSource,
  adapter: ClientAdapter = cursorAdapter,
): Promise<AgentGraph> {
  const files = await source.list();
  const diagnostics: GraphDiagnostic[] = [...((await source.diagnostics?.()) ?? [])];
  const classified = adapter.classify(files);
  diagnostics.push(...classified.diagnostics);

  const fragments: GraphFragment[] = [];
  for (const discovered of classified.discovered) {
    const bytes = await source.read(discovered.path);
    if (!bytes) {
      diagnostics.push({
        code: 'unreadable-file',
        message: 'File was listed but could not be read.',
        severity: 'error',
        path: discovered.path,
      });
      continue;
    }
    const decoded = decodeUtf8Strict(bytes);
    if (!decoded.ok) {
      diagnostics.push({
        code: 'undecodable-file',
        message: decoded.reason === 'binary' ? 'File looks binary.' : 'File is not valid UTF-8.',
        severity: 'error',
        path: discovered.path,
      });
      continue;
    }
    fragments.push(
      adapter.parse(discovered, {
        path: discovered.path,
        text: decoded.text,
        bom: decoded.bom,
        contentHash: await sha256Hex(bytes),
      }),
    );
  }
  diagnostics.push(...(adapter.finalize?.(fragments) ?? []));

  const hashes = new Map<RepoPath, string>();
  for (const path of fileNodePaths(files, fragments)) {
    const bytes = await source.read(path);
    if (bytes) hashes.set(path, await sha256Hex(bytes));
  }

  return buildGraph({
    source: { id: source.id, capabilities: source.capabilities },
    generatedBy: { adapter: adapter.id, version: adapter.version },
    files,
    fragments,
    diagnostics,
    hashes,
  });
}
