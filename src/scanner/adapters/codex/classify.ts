import { basename, dirname, type GraphDiagnostic, type RepoPath, ROOT_DIR } from '../../../core';
import type { ClassifyResult, Discovered } from '../../adapter';
import { assignSkillMembers, matchRoot } from '../../classify-util';

const ADAPTER_ID = 'codex';
const ENGINE = 'codex' as const;

function info(code: string, path: RepoPath, message: string): GraphDiagnostic {
  return { code, message, severity: 'info', path };
}

/**
 * Codex surfaces: `.codex/skills` and `.codex/agents`.
 * Codex reads repo `AGENTS.md` (owned by the Cursor adapter as a shared convention);
 * no separate Codex-only instruction filename is given semantics here.
 */
export function classifyCodexPaths(paths: readonly RepoPath[]): ClassifyResult {
  const discovered: Discovered[] = [];
  const diagnostics: GraphDiagnostic[] = [];
  const skills: Discovered[] = [];

  for (const path of paths) {
    const match = matchRoot(path, ['.codex']);
    if (!match) continue;
    const name = basename(path);
    const [area, ...below] = match.rest;
    const nested = match.scope !== ROOT_DIR;

    if (area === 'skills' && name === 'SKILL.md' && below.length >= 2) {
      const skill: Discovered = {
        kind: 'skill',
        path,
        scope: match.scope,
        root: '.codex',
        engine: ENGINE,
        adapterId: ADAPTER_ID,
        skillDir: dirname(path),
      };
      skills.push(skill);
      discovered.push(skill);
      continue;
    }

    if (area === 'agents' && below.length === 1 && name.endsWith('.md')) {
      discovered.push({
        kind: 'agent',
        path,
        scope: match.scope,
        root: '.codex',
        engine: ENGINE,
        adapterId: ADAPTER_ID,
      });
      if (nested) {
        diagnostics.push(
          info(
            'unverified-nested-agents',
            path,
            'Nested .codex/agents support is not verified; scope shown as an attribute only.',
          ),
        );
      }
    }
  }

  assignSkillMembers(skills, paths);
  return { discovered, diagnostics };
}
