import type { ReplaceResult, WritableFileSource } from './file-source';
import { sha256Hex } from './hash';
import { isIgnoredPath, normalizeRepoPath, type RepoPath } from './paths';

/**
 * In-memory writable source for edit-route tests. Not used by the product (local writes go
 * through `LocalFileSource`); capability.write is true so the UI path can be exercised.
 */
export class WritableMemoryFileSource implements WritableFileSource {
  readonly id: string;
  readonly capabilities = { write: true, watch: false };
  readonly #files = new Map<RepoPath, Uint8Array>();

  constructor(
    files: Iterable<readonly [string, Uint8Array | string]> | Record<string, Uint8Array | string>,
    options: { id?: string } = {},
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

  async replaceIfUnchanged(
    path: RepoPath,
    expectedHash: string,
    bytes: Uint8Array,
  ): Promise<ReplaceResult> {
    const key = normalizeRepoPath(path);
    if (isIgnoredPath(key)) return { ok: false, reason: 'missing' };
    const current = this.#files.get(key);
    if (!current) return { ok: false, reason: 'missing' };
    const currentHash = await sha256Hex(current);
    if (currentHash !== expectedHash) return { ok: false, reason: 'conflict', currentHash };
    this.#files.set(key, new Uint8Array(bytes));
    return { ok: true, hash: await sha256Hex(bytes) };
  }
}
