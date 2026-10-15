import type { RepoPath } from './paths';
import type { FileSourceCapabilities, GraphDiagnostic } from './schema';

export interface FileSource {
  /** `local:<abs>` | `memory:<id>` */
  readonly id: string;
  readonly capabilities: FileSourceCapabilities;
  /** Files only, sorted. The source applies the ignore list and its symlink policy. */
  list(): Promise<RepoPath[]>;
  /** Null when the path is missing or not readable through this source. */
  read(path: RepoPath): Promise<Uint8Array | null>;
  /** Issues found while listing (skipped symlinks, oversized files). */
  diagnostics?(): Promise<GraphDiagnostic[]>;
}

export type ReplaceResult =
  | { ok: true; hash: string }
  | { ok: false; reason: 'conflict' | 'missing'; currentHash?: string };

/** Implemented in M3. */
export interface WritableFileSource extends FileSource {
  replaceIfUnchanged(
    path: RepoPath,
    expectedHash: string,
    bytes: Uint8Array,
  ): Promise<ReplaceResult>;
}
