import { randomBytes } from 'node:crypto';
import {
  chmod,
  lstat,
  open,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'tinyglobby';
import {
  type GraphDiagnostic,
  IGNORED_DIR_NAMES,
  normalizeRepoPath,
  type ReplaceResult,
  type RepoPath,
  sha256Hex,
  type WritableFileSource,
} from '../../core';

export const MAX_FILE_BYTES = 1024 * 1024;

const IGNORE_PATTERNS = IGNORED_DIR_NAMES.map((name) => `**/${name}/**`);

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

interface Listing {
  paths: RepoPath[];
  diagnostics: GraphDiagnostic[];
}

/**
 * Local directory source. Applies the fixed ignore list, never follows or lists symlinks, keeps
 * every path inside the real root, skips files over 1 MB, and (for M3) can replace a file only
 * when its content hash still matches.
 */
export class LocalFileSource implements WritableFileSource {
  readonly id: string;
  readonly capabilities = { write: true, watch: false };
  readonly #root: string;
  #listing: Promise<Listing> | undefined;

  private constructor(realRoot: string) {
    this.#root = realRoot;
    this.id = `local:${realRoot}`;
  }

  static async open(root: string): Promise<LocalFileSource> {
    const realRoot = await realpath(path.resolve(root));
    if (!(await lstat(realRoot)).isDirectory()) throw new Error(`Not a directory: ${root}`);
    return new LocalFileSource(realRoot);
  }

  async list(): Promise<RepoPath[]> {
    return (await this.#list()).paths;
  }

  async diagnostics(): Promise<GraphDiagnostic[]> {
    return (await this.#list()).diagnostics;
  }

  async read(repoPath: RepoPath): Promise<Uint8Array | null> {
    const absolute = await this.#resolveSafe(repoPath);
    if (!absolute) return null;
    try {
      const stat = await lstat(absolute);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
      return new Uint8Array(await readFile(absolute));
    } catch {
      return null;
    }
  }

  /**
   * Atomic replace: write a temp file in the same directory (mode preserved), then rename.
   * Refuses symlinks and non-regular files. Re-checks that the real path still sits inside the root.
   */
  async replaceIfUnchanged(
    repoPath: RepoPath,
    expectedHash: string,
    bytes: Uint8Array,
  ): Promise<ReplaceResult> {
    if (bytes.byteLength > MAX_FILE_BYTES) {
      return { ok: false, reason: 'missing' };
    }
    const absolute = await this.#resolveSafe(repoPath);
    if (!absolute) return { ok: false, reason: 'missing' };

    let mode: number;
    try {
      const before = await lstat(absolute);
      if (!before.isFile() || before.isSymbolicLink()) return { ok: false, reason: 'missing' };
      mode = before.mode;
      const current = new Uint8Array(await readFile(absolute));
      const currentHash = await sha256Hex(current);
      if (currentHash !== expectedHash) {
        return { ok: false, reason: 'conflict', currentHash };
      }
    } catch {
      return { ok: false, reason: 'missing' };
    }

    const temp = path.join(
      path.dirname(absolute),
      `.sv-write-${process.pid}-${randomBytes(8).toString('hex')}`,
    );
    try {
      await writeFile(temp, bytes, { flag: 'wx' });
      await chmod(temp, mode);
      // Re-check the destination has not become a symlink or escaped the root.
      const again = await this.#resolveSafe(repoPath);
      if (again !== absolute) {
        await unlink(temp).catch(() => {});
        return { ok: false, reason: 'missing' };
      }
      const handle = await open(absolute, 'r');
      try {
        const afterStat = await handle.stat();
        if (!afterStat.isFile()) {
          await unlink(temp).catch(() => {});
          return { ok: false, reason: 'missing' };
        }
        const current = new Uint8Array(await readFile(absolute));
        const currentHash = await sha256Hex(current);
        if (currentHash !== expectedHash) {
          await unlink(temp).catch(() => {});
          return { ok: false, reason: 'conflict', currentHash };
        }
      } finally {
        await handle.close();
      }
      await rename(temp, absolute);
      this.#listing = undefined;
      return { ok: true, hash: await sha256Hex(bytes) };
    } catch (error) {
      await unlink(temp).catch(() => {});
      throw error;
    }
  }

  /** Absolute path for a repo path, or null if invalid, a symlink, or outside the real root. */
  async #resolveSafe(repoPath: string): Promise<string | null> {
    let normalized: RepoPath;
    try {
      normalized = normalizeRepoPath(repoPath);
    } catch {
      return null;
    }
    const absolute = path.join(this.#root, ...normalized.split('/'));
    try {
      if ((await lstat(absolute)).isSymbolicLink()) return null;
      const real = await realpath(absolute);
      return isInside(this.#root, real) && real === absolute ? absolute : null;
    } catch {
      return null;
    }
  }

  #list(): Promise<Listing> {
    this.#listing ??= this.#scan();
    return this.#listing;
  }

  async #scan(): Promise<Listing> {
    const entries = await glob(['**/*'], {
      cwd: this.#root,
      dot: true,
      onlyFiles: true,
      followSymbolicLinks: false,
      expandDirectories: false,
      ignore: IGNORE_PATTERNS,
    });
    const paths: RepoPath[] = [];
    const diagnostics: GraphDiagnostic[] = [];
    for (const entry of entries.sort()) {
      let repoPath: RepoPath;
      try {
        repoPath = normalizeRepoPath(entry);
      } catch {
        continue;
      }
      const absolute = path.join(this.#root, ...repoPath.split('/'));
      const stat = await lstat(absolute).catch(() => null);
      if (!stat?.isFile()) continue;
      if (stat.size > MAX_FILE_BYTES) {
        diagnostics.push({
          code: 'file-too-large',
          message: `File is larger than ${MAX_FILE_BYTES} bytes and was skipped.`,
          severity: 'warning',
          path: repoPath,
        });
        continue;
      }
      if (!(await this.#resolveSafe(repoPath))) continue;
      paths.push(repoPath);
    }
    return { paths, diagnostics };
  }
}
