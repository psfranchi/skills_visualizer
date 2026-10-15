import { basename, dirname, type GraphDiagnostic, type RepoPath, ROOT_DIR } from '../../../core';
import type { ClassifyResult, ConfigRoot, Discovered } from '../../adapter';
import { assignSkillMembers, matchRoot } from '../../classify-util';
import { engineForRoot } from '../../engine';

const ADAPTER_ID = 'cursor';
const SKILL_ROOTS: readonly ConfigRoot[] = ['.cursor', '.agents'];
const AGENT_ROOTS: readonly ConfigRoot[] = ['.cursor'];

function info(code: string, path: RepoPath, message: string): GraphDiagnostic {
  return { code, message, severity: 'info', path };
}

function base(
  kind: Discovered['kind'],
  path: RepoPath,
  scope: RepoPath,
  root?: ConfigRoot,
): Pick<Discovered, 'kind' | 'path' | 'scope' | 'root' | 'engine' | 'adapterId'> {
  return {
    kind,
    path,
    scope,
    ...(root ? { root } : {}),
    engine: kind === 'instruction' ? 'cursor' : engineForRoot(root),
    adapterId: ADAPTER_ID,
  };
}

/** Cursor surfaces: AGENTS.md, `.cursor/**`, and shared `.agents` skills. */
export function classifyCursorPaths(paths: readonly RepoPath[]): ClassifyResult {
  const discovered: Discovered[] = [];
  const diagnostics: GraphDiagnostic[] = [];
  const skills: Discovered[] = [];

  for (const path of paths) {
    const name = basename(path);
    if (name === 'AGENTS.md') {
      discovered.push({ ...base('instruction', path, dirname(path)) });
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

    const match = matchRoot(path, ['.cursor', '.agents']);
    const [area, ...below] = match?.rest ?? [];
    const nested = match !== null && match.scope !== ROOT_DIR;

    if (name === 'SKILL.md') {
      if (match && area === 'skills' && SKILL_ROOTS.includes(match.root) && below.length >= 2) {
        const skill: Discovered = {
          ...base('skill', path, match.scope, match.root),
          skillDir: dirname(path),
        };
        skills.push(skill);
        discovered.push(skill);
        continue;
      }
      // Foreign roots are matched separately — cursor classify only looks at `.cursor`/`.agents`.
      const foreign = matchRoot(path, ['.claude', '.codex']);
      if (foreign) continue;
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
        discovered.push({ ...base('rule', path, match.scope, match.root) });
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
      discovered.push({ ...base('agent', path, match.scope, match.root) });
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
      discovered.push({ ...base('mcp-config', path, match.scope, match.root) });
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
