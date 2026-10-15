import { basename, dirname, type GraphDiagnostic, type RepoPath, ROOT_DIR } from '../../../core';
import type { ClassifyResult, Discovered } from '../../adapter';
import { assignSkillMembers, matchRoot } from '../../classify-util';

const ADAPTER_ID = 'claude';
const ENGINE = 'claude' as const;

function info(code: string, path: RepoPath, message: string): GraphDiagnostic {
  return { code, message, severity: 'info', path };
}

// Claude Code surfaces (code.claude.com): CLAUDE.md, .claude/skills, .claude/agents.
// .claude/rules is diagnostic-only — no Cursor activation semantics.
export function classifyClaudePaths(paths: readonly RepoPath[]): ClassifyResult {
  const discovered: Discovered[] = [];
  const diagnostics: GraphDiagnostic[] = [];
  const skills: Discovered[] = [];

  for (const path of paths) {
    const name = basename(path);

    if (name === 'CLAUDE.md') {
      const match = matchRoot(path, ['.claude']);
      discovered.push({
        kind: 'instruction',
        path,
        scope: match ? match.scope : dirname(path),
        ...(match ? { root: '.claude' as const } : {}),
        engine: ENGINE,
        adapterId: ADAPTER_ID,
      });
      continue;
    }

    const match = matchRoot(path, ['.claude']);
    if (!match) continue;
    const [area, ...below] = match.rest;
    const nested = match.scope !== ROOT_DIR;

    if (area === 'skills' && name === 'SKILL.md' && below.length >= 2) {
      const skill: Discovered = {
        kind: 'skill',
        path,
        scope: match.scope,
        root: '.claude',
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
        root: '.claude',
        engine: ENGINE,
        adapterId: ADAPTER_ID,
      });
      if (nested) {
        diagnostics.push(
          info(
            'unverified-nested-agents',
            path,
            'Nested .claude/agents support is not verified; scope shown as an attribute only.',
          ),
        );
      }
      continue;
    }

    if (area === 'rules' && below.length >= 1 && (name.endsWith('.md') || name.endsWith('.mdc'))) {
      diagnostics.push(
        info(
          'unverified-claude-rules',
          path,
          'Claude `.claude/rules` files are documented but not given Cursor rule-activation semantics; surfaced as a diagnostic only.',
        ),
      );
    }
  }

  assignSkillMembers(skills, paths);
  return { discovered, diagnostics };
}
