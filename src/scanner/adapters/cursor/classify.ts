import { basename, dirname, type GraphDiagnostic, type RepoPath, ROOT_DIR } from '../../../core';
import type { ClassifyResult, ConfigRoot, Discovered } from '../../adapter';

const CONFIG_ROOTS: readonly ConfigRoot[] = ['.cursor', '.agents', '.claude', '.codex'];
const SKILL_ROOTS: readonly ConfigRoot[] = CONFIG_ROOTS;
const AGENT_ROOTS: readonly ConfigRoot[] = ['.cursor', '.claude', '.codex'];

interface RootMatch {
  root: ConfigRoot;
  scope: RepoPath;
  /** Segments after the root directory. */
  rest: string[];
}

function matchRoot(path: RepoPath): RootMatch | null {
  const segments = path.split('/');
  const index = segments.findIndex((s) => (CONFIG_ROOTS as readonly string[]).includes(s));
  if (index === -1) return null;
  return {
    root: segments[index] as ConfigRoot,
    scope: (index === 0 ? ROOT_DIR : segments.slice(0, index).join('/')) as RepoPath,
    rest: segments.slice(index + 1),
  };
}

function info(code: string, path: RepoPath, message: string): GraphDiagnostic {
  return { code, message, severity: 'info', path };
}

/** Pure path classification for the Cursor adapter. */
export function classifyCursorPaths(paths: readonly RepoPath[]): ClassifyResult {
  const discovered: Discovered[] = [];
  const diagnostics: GraphDiagnostic[] = [];
  const skills: Discovered[] = [];

  for (const path of paths) {
    const name = basename(path);
    if (name === 'AGENTS.md') {
      discovered.push({ kind: 'instruction', path, scope: dirname(path) });
      continue;
    }
    if (name.toLowerCase() === 'agents.md') {
      diagnostics.push(
        info(
          'agents-md-case',
          path,
          `"${name}" differs from AGENTS.md only by case; case sensitivity is not verified, so it is not treated as instructions.`,
        ),
      );
      continue;
    }

    const match = matchRoot(path);
    const [area, ...below] = match?.rest ?? [];
    const nested = match !== null && match.scope !== ROOT_DIR;

    if (
      match &&
      area === 'skills' &&
      SKILL_ROOTS.includes(match.root) &&
      name === 'SKILL.md' &&
      below.length >= 2
    ) {
      const skill: Discovered = {
        kind: 'skill',
        path,
        scope: match.scope,
        root: match.root,
        skillDir: dirname(path),
      };
      skills.push(skill);
      discovered.push(skill);
      continue;
    }
    if (name === 'SKILL.md') {
      diagnostics.push(
        info(
          'skill-outside-root',
          path,
          'SKILL.md is outside every skill root; not treated as a skill.',
        ),
      );
      continue;
    }

    if (match?.root === '.cursor' && area === 'rules' && below.length >= 1) {
      if (name.endsWith('.mdc')) {
        discovered.push({ kind: 'rule', path, scope: match.scope, root: match.root });
        if (nested) {
          diagnostics.push(
            info(
              'unverified-nested-rules',
              path,
              'Nested .cursor/rules support is not verified; scope shown as an attribute only.',
            ),
          );
        }
      } else if (name.endsWith('.md')) {
        diagnostics.push(
          info(
            'rule-not-mdc',
            path,
            'Cursor loads only .mdc files from .cursor/rules; this .md file is ignored.',
          ),
        );
      }
      continue;
    }

    if (
      match &&
      area === 'agents' &&
      AGENT_ROOTS.includes(match.root) &&
      below.length === 1 &&
      name.endsWith('.md')
    ) {
      discovered.push({ kind: 'agent', path, scope: match.scope, root: match.root });
      if (nested) {
        diagnostics.push(
          info(
            'unverified-nested-agents',
            path,
            'Nested agent directories are not verified; scope shown as an attribute only.',
          ),
        );
      }
      continue;
    }

    if (match?.root === '.cursor' && area === 'mcp.json' && below.length === 0) {
      discovered.push({ kind: 'mcp-config', path, scope: match.scope, root: match.root });
      if (nested) {
        diagnostics.push(
          info('unverified-nested-mcp', path, 'Nested .cursor/mcp.json support is not verified.'),
        );
      }
    }
  }

  assignSkillMembers(skills, paths);
  return { discovered, diagnostics };
}

/** Each file belongs to the deepest skill folder containing it; `SKILL.md` files are not members. */
function assignSkillMembers(skills: Discovered[], paths: readonly RepoPath[]): void {
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
