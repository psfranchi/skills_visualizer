/** POSIX, repo-relative, no `..`, no NUL. `.` is the repository root (never a listed file). */
export type RepoPath = string & { readonly __brand: 'RepoPath' };

export const ROOT_DIR = '.' as RepoPath;

/** Directory names skipped at any depth. Hidden agent-config dirs (`.cursor`, `.agents`, `.claude`, `.codex`) are kept. */
export const IGNORED_DIR_NAMES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.venv',
  'vendor',
] as const;

const IGNORED = new Set<string>(IGNORED_DIR_NAMES);

export class InvalidRepoPathError extends Error {
  constructor(
    readonly input: string,
    readonly reason: string,
  ) {
    super(`Invalid repository path (${reason}): ${JSON.stringify(input)}`);
    this.name = 'InvalidRepoPathError';
  }
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Canonicalizes a repo-relative path. Throws `InvalidRepoPathError` for absolute paths,
 * `..` segments (plain or percent-encoded), NUL bytes, backslashes, and empty input.
 */
export function normalizeRepoPath(input: string): RepoPath {
  if (input.length === 0) throw new InvalidRepoPathError(input, 'empty');
  if (input.includes('\0')) throw new InvalidRepoPathError(input, 'NUL byte');
  if (input.includes('\\')) throw new InvalidRepoPathError(input, 'backslash');
  if (input.startsWith('/') || /^[A-Za-z]:/.test(input) || input.startsWith('~')) {
    throw new InvalidRepoPathError(input, 'absolute');
  }
  const segments: string[] = [];
  for (const segment of input.split('/')) {
    if (segment === '' || segment === '.') continue;
    const decoded = decodeSegment(segment);
    if (segment === '..' || decoded === '..' || decoded === '.') {
      throw new InvalidRepoPathError(input, 'traversal');
    }
    if (decoded !== segment && /[/\\\0]/.test(decoded)) {
      throw new InvalidRepoPathError(input, 'encoded separator');
    }
    segments.push(segment);
  }
  return (segments.length === 0 ? ROOT_DIR : segments.join('/')) as RepoPath;
}

export function isIgnoredPath(path: RepoPath): boolean {
  return path.split('/').some((segment) => IGNORED.has(segment));
}

export function dirname(path: RepoPath): RepoPath {
  const index = path.lastIndexOf('/');
  return (index === -1 ? ROOT_DIR : path.slice(0, index)) as RepoPath;
}

export function basename(path: RepoPath): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function joinRepoPath(dir: RepoPath, child: string): RepoPath {
  return normalizeRepoPath(dir === ROOT_DIR ? child : `${dir}/${child}`);
}

/** True when `path` is `dir` itself or lies below it. */
export function isWithin(path: RepoPath, dir: RepoPath): boolean {
  return dir === ROOT_DIR || path === dir || path.startsWith(`${dir}/`);
}

/**
 * Resolves `target` (POSIX, may contain `..`) against `fromDir`; a leading `/` means the repo root.
 * Returns null when the result would escape the repository root or is otherwise invalid.
 */
export function resolveRepoPath(fromDir: RepoPath, target: string): RepoPath | null {
  const stack = target.startsWith('/') || fromDir === ROOT_DIR ? [] : fromDir.split('/');
  for (const segment of target.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (stack.length === 0) return null;
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  try {
    return normalizeRepoPath(stack.length === 0 ? '.' : stack.join('/'));
  } catch {
    return null;
  }
}
