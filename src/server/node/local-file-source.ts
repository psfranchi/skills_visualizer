import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'tinyglobby';
import {
  type FileSource,
  type GraphDiagnostic,
  IGNORED_DIR_NAMES,
  normalizeRepoPath,
  type RepoPath,
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
 * Read-only view of a local directory. Applies the fixed ignore list, never follows or lists
 * symlinks, keeps every path inside the real root, and skips files over 1 MB with a diagnostic.
 */
export class LocalFileSource implements FileSource {
  readonly id: string;
  readonly capabilities = { write: false, watch: false };
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
