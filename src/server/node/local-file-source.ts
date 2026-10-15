import { randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  chmod,
  type FileHandle,
  lstat,
  open,
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

const OPEN_READ =
  fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0);

const OPEN_DIR =
  fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | (fsConstants.O_NOFOLLOW ?? 0);

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

interface Listing {
  paths: RepoPath[];
  diagnostics: GraphDiagnostic[];
}

interface DevIno {
  dev: number | bigint;
  ino: number | bigint;
}

function sameNode(a: DevIno, b: DevIno): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

/** True when `/proc/self/fd/<n>` resolves (Linux); used to bind rename to an opened directory. */
export async function procFdSupported(): Promise<boolean> {
  try {
    const handle = await open('.', fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0));
    try {
      await lstat(`/proc/self/fd/${handle.fd}`);
      return true;
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
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
  /**
   * Test-only: runs after the temp file is written and before the final rename.
   * Used to inject a parent-directory symlink swap.
   */
  _testBeforeRename?: () => void | Promise<void>;

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
      const result = await this.#readRegularFile(absolute);
      return result?.bytes ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Atomic replace: write a temp file in the same directory (mode preserved), then rename.
   * Refuses symlinks and non-regular files. Re-checks that the real path still sits inside the root.
   * On Linux, temp create + rename go through `/proc/self/fd/<dirfd>/…` so they are bound to the
   * opened parent directory inode (defeats a parent-dir symlink swap). Elsewhere the lstat chain
   * and parent dev/ino are re-verified immediately before rename (residual race — see security backlog).
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

    const parentPath = path.dirname(absolute);
    const baseName = path.basename(absolute);
    const tempName = `.sv-write-${process.pid}-${randomBytes(8).toString('hex')}`;

    let mode: number;
    let fileNode: DevIno;
    try {
      const initial = await lstat(absolute);
      if (!initial.isFile() || initial.isSymbolicLink()) return { ok: false, reason: 'missing' };
      mode = initial.mode;
      fileNode = { dev: initial.dev, ino: initial.ino };
      const opened = await this.#readRegularFile(absolute);
      if (!opened || !sameNode(opened.node, fileNode)) return { ok: false, reason: 'missing' };
      if (opened.bytes.byteLength > MAX_FILE_BYTES) return { ok: false, reason: 'missing' };
      const currentHash = await sha256Hex(opened.bytes);
      if (currentHash !== expectedHash) {
        return { ok: false, reason: 'conflict', currentHash };
      }
    } catch {
      return { ok: false, reason: 'missing' };
    }

    const parentCheck = await this.#openVerifiedParent(parentPath);
    if (!parentCheck) return { ok: false, reason: 'missing' };
    const { handle: parentFd, node: parentNode, useProcFd } = parentCheck;
    const tempPath = path.join(parentPath, tempName);
    let tempWritten = false;

    try {
      const tempViaProc = useProcFd ? `/proc/self/fd/${parentFd.fd}/${tempName}` : tempPath;
      const destViaProc = useProcFd ? `/proc/self/fd/${parentFd.fd}/${baseName}` : absolute;

      await writeFile(tempViaProc, bytes, { flag: 'wx', mode: 0o600 });
      tempWritten = true;
      await chmod(tempViaProc, mode & 0o777);

      if (this._testBeforeRename) await this._testBeforeRename();

      // Re-verify the path chain and that the parent fd still names the same directory.
      const stillParent = await this.#verifyParentUnchanged(parentPath, parentNode);
      if (!stillParent) {
        await unlink(tempViaProc).catch(() => {});
        return { ok: false, reason: 'missing' };
      }
      const again = await this.#resolveSafe(repoPath);
      if (again !== absolute) {
        await unlink(tempViaProc).catch(() => {});
        return { ok: false, reason: 'missing' };
      }

      const recheck = await this.#readRegularFile(absolute);
      if (!recheck || !sameNode(recheck.node, fileNode)) {
        await unlink(tempViaProc).catch(() => {});
        return { ok: false, reason: 'missing' };
      }
      const currentHash = await sha256Hex(recheck.bytes);
      if (currentHash !== expectedHash) {
        await unlink(tempViaProc).catch(() => {});
        return { ok: false, reason: 'conflict', currentHash };
      }

      if (!useProcFd) {
        // macOS / no /proc: last-chance lstat walk (residual race documented in the backlog).
        const lastChance = await this.#verifyParentUnchanged(parentPath, parentNode);
        if (!lastChance) {
          await unlink(tempPath).catch(() => {});
          return { ok: false, reason: 'missing' };
        }
      }

      await rename(tempViaProc, destViaProc);
      tempWritten = false;
      this.#listing = undefined;
      return { ok: true, hash: await sha256Hex(bytes) };
    } catch (error) {
      if (tempWritten) {
        const cleanup = useProcFd ? `/proc/self/fd/${parentFd.fd}/${tempName}` : tempPath;
        await unlink(cleanup).catch(() => {});
        await unlink(tempPath).catch(() => {});
      }
      // A parent swapped to a symlink often surfaces as ENOENT/EACCES on /proc paths — treat as miss.
      if (isBenignFsError(error)) return { ok: false, reason: 'missing' };
      throw error;
    } finally {
      await parentFd.close().catch(() => {});
    }
  }

  /** Open a regular file with O_NOFOLLOW (+ O_NONBLOCK); verify fstat matches the initial lstat. */
  async #readRegularFile(absolute: string): Promise<{ bytes: Uint8Array; node: DevIno } | null> {
    const before = await lstat(absolute);
    if (!before.isFile() || before.isSymbolicLink()) return null;
    if (before.size > MAX_FILE_BYTES) return null;
    const handle = await open(absolute, OPEN_READ);
    try {
      const st = await handle.stat();
      if (!st.isFile() || st.isSymbolicLink()) return null;
      if (st.dev !== before.dev || st.ino !== before.ino) return null;
      if (st.size > MAX_FILE_BYTES) return null;
      const buf = Buffer.alloc(Number(st.size));
      let offset = 0;
      while (offset < buf.length) {
        const { bytesRead } = await handle.read(buf, offset, buf.length - offset, offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      return {
        bytes: new Uint8Array(buf.subarray(0, offset)),
        node: { dev: st.dev, ino: st.ino },
      };
    } finally {
      await handle.close();
    }
  }

  /**
   * Open the parent directory without following symlinks, confirm every path component from the
   * real root is a non-symlink directory, and that the opened fd's dev/ino match the parent's lstat.
   */
  async #openVerifiedParent(
    parentPath: string,
  ): Promise<{ handle: FileHandle; node: DevIno; useProcFd: boolean } | null> {
    if (!(await this.#pathChainClean(parentPath))) return null;
    const listed = await lstat(parentPath);
    if (!listed.isDirectory() || listed.isSymbolicLink()) return null;
    let handle: FileHandle;
    try {
      handle = await open(parentPath, OPEN_DIR);
    } catch {
      return null;
    }
    try {
      const st = await handle.stat();
      if (!st.isDirectory() || st.dev !== listed.dev || st.ino !== listed.ino) {
        await handle.close();
        return null;
      }
      const useProcFd = await procFdSupported();
      return { handle, node: { dev: st.dev, ino: st.ino }, useProcFd };
    } catch {
      await handle.close().catch(() => {});
      return null;
    }
  }

  async #verifyParentUnchanged(parentPath: string, expected: DevIno): Promise<boolean> {
    if (!(await this.#pathChainClean(parentPath))) return false;
    try {
      const st = await lstat(parentPath);
      return (
        st.isDirectory() && !st.isSymbolicLink() && sameNode({ dev: st.dev, ino: st.ino }, expected)
      );
    } catch {
      return false;
    }
  }

  /** lstat every component from `#root` to `target`; each must exist and not be a symlink. */
  async #pathChainClean(target: string): Promise<boolean> {
    if (!isInside(this.#root, target) && target !== this.#root) return false;
    const relative = path.relative(this.#root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
    let cursor = this.#root;
    try {
      const rootStat = await lstat(cursor);
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return false;
    } catch {
      return false;
    }
    if (relative === '') return true;
    for (const part of relative.split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, part);
      try {
        const st = await lstat(cursor);
        if (st.isSymbolicLink()) return false;
      } catch {
        return false;
      }
    }
    return true;
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
      if (!(await this.#pathChainClean(path.dirname(absolute)))) return null;
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

function isBenignFsError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as NodeJS.ErrnoException).code;
  return (
    code === 'ENOENT' ||
    code === 'EACCES' ||
    code === 'EPERM' ||
    code === 'ENOTDIR' ||
    code === 'ELOOP'
  );
}
