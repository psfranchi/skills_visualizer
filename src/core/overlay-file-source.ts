import type { FileSource } from './file-source';
import type { RepoPath } from './paths';
import type { GraphDiagnostic } from './schema';

/**
 * Read-only overlay: every path comes from `base` except the overrides, which supply new bytes.
 * Used to preview the graph after a planned edit without writing the repo.
 */
export class OverlayFileSource implements FileSource {
  readonly id: string;
  readonly capabilities: FileSource['capabilities'];
  readonly #base: FileSource;
  readonly #overrides: ReadonlyMap<RepoPath, Uint8Array>;

  constructor(base: FileSource, overrides: ReadonlyMap<RepoPath, Uint8Array>) {
    this.#base = base;
    this.#overrides = overrides;
    this.id = base.id;
    this.capabilities = { ...base.capabilities, write: false };
  }

  list(): Promise<RepoPath[]> {
    return this.#base.list();
  }

  diagnostics(): Promise<GraphDiagnostic[]> {
    return this.#base.diagnostics?.() ?? Promise.resolve([]);
  }

  async read(path: RepoPath): Promise<Uint8Array | null> {
    const override = this.#overrides.get(path);
    if (override !== undefined) return new Uint8Array(override);
    return this.#base.read(path);
  }
}
