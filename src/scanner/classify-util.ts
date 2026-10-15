import { basename, dirname, type RepoPath, ROOT_DIR } from '../core';
import type { ConfigRoot, Discovered } from './adapter';

export const ALL_CONFIG_ROOTS: readonly ConfigRoot[] = ['.cursor', '.agents', '.claude', '.codex'];

export interface RootMatch {
  root: ConfigRoot;
  scope: RepoPath;
  /** Segments after the root directory. */
  rest: string[];
}

export function matchRoot(
  path: RepoPath,
  roots: readonly ConfigRoot[] = ALL_CONFIG_ROOTS,
): RootMatch | null {
  const segments = path.split('/');
  const index = segments.findIndex((s) => (roots as readonly string[]).includes(s));
  if (index === -1) return null;
  return {
    root: segments[index] as ConfigRoot,
    scope: (index === 0 ? ROOT_DIR : segments.slice(0, index).join('/')) as RepoPath,
    rest: segments.slice(index + 1),
  };
}

/** Each file belongs to the deepest skill folder containing it; `SKILL.md` files are not members. */
export function assignSkillMembers(skills: Discovered[], paths: readonly RepoPath[]): void {
  const byDir = new Map<RepoPath, Discovered>();
  for (const skill of skills) {
    if (skill.skillDir) byDir.set(skill.skillDir, skill);
    skill.memberFiles = [];
  }
  if (byDir.size === 0) return;
  for (const path of paths) {
    if (basename(path) === 'SKILL.md' && byDir.has(dirname(path))) continue;
    for (let dir = dirname(path); dir !== ROOT_DIR; dir = dirname(dir)) {
      const owner = byDir.get(dir);
      if (owner) {
        owner.memberFiles?.push(path);
        break;
      }
    }
  }
}
