import type { FileSource } from './file-source';
import { isIgnoredPath, normalizeRepoPath, type RepoPath } from './paths';

export interface MemoryFileSourceOptions {
  /** Defaults to a random `memory:<uuid>`; pass a fixed id for deterministic output. */
  id?: string;
}

/** In-memory, read-only source used by core tests and (later) upload mode. Applies the fixed ignore list. */
export class MemoryFileSource implements FileSource {
  readonly id: string;
  readonly capabilities = { write: false, watch: false };
  readonly #files = new Map<RepoPath, Uint8Array>();

  constructor(
    files: Iterable<readonly [string, Uint8Array | string]> | Record<string, Uint8Array | string>,
    options: MemoryFileSourceOptions = {},
  ) {
    this.id = options.id ?? `memory:${globalThis.crypto.randomUUID()}`;
    const entries = Symbol.iterator in files ? files : Object.entries(files);
    const encoder = new TextEncoder();
    for (const [path, content] of entries) {
      const bytes = typeof content === 'string' ? encoder.encode(content) : new Uint8Array(content);
      this.#files.set(normalizeRepoPath(path), bytes);
    }
  }

  async list(): Promise<RepoPath[]> {
    return [...this.#files.keys()].filter((path) => !isIgnoredPath(path)).sort();
  }

  async read(path: RepoPath): Promise<Uint8Array | null> {
    const bytes = this.#files.get(path);
    return bytes && !isIgnoredPath(path) ? new Uint8Array(bytes) : null;
  }
}
