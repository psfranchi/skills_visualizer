import { describe, expect, it } from 'vitest';
import type { RepoPath } from '../../../core';
import { classifyCursorPaths } from './classify';

function classify(paths: string[]) {
  return classifyCursorPaths((paths as RepoPath[]).sort());
}

describe('classifyCursorPaths', () => {
  it('discovers every documented root and tags it', () => {
    const { discovered } = classify([
      'AGENTS.md',
      'pkg/AGENTS.md',
      '.cursor/rules/a.mdc',
      '.cursor/rules/sub/b.mdc',
      '.cursor/skills/s1/SKILL.md',
      '.agents/skills/s2/SKILL.md',
      '.claude/skills/s3/SKILL.md',
      '.codex/skills/group/s4/SKILL.md',
      '.cursor/agents/a1.md',
      '.claude/agents/a2.md',
      '.codex/agents/a3.md',
      '.cursor/mcp.json',
    ]);
    expect(discovered.map((d) => [d.kind, d.path, d.root ?? null, d.scope])).toEqual([
      ['skill', '.agents/skills/s2/SKILL.md', '.agents', '.'],
      ['agent', '.claude/agents/a2.md', '.claude', '.'],
      ['skill', '.claude/skills/s3/SKILL.md', '.claude', '.'],
      ['agent', '.codex/agents/a3.md', '.codex', '.'],
      ['skill', '.codex/skills/group/s4/SKILL.md', '.codex', '.'],
      ['agent', '.cursor/agents/a1.md', '.cursor', '.'],
      ['mcp-config', '.cursor/mcp.json', '.cursor', '.'],
      ['rule', '.cursor/rules/a.mdc', '.cursor', '.'],
      ['rule', '.cursor/rules/sub/b.mdc', '.cursor', '.'],
      ['skill', '.cursor/skills/s1/SKILL.md', '.cursor', '.'],
      ['instruction', 'AGENTS.md', null, '.'],
      ['instruction', 'pkg/AGENTS.md', null, 'pkg'],
    ]);
  });

  it('scopes nested skill roots to their directory', () => {
    const { discovered } = classify(['apps/x/.cursor/skills/s/SKILL.md']);
    expect(discovered[0]).toMatchObject({
      kind: 'skill',
      scope: 'apps/x',
      skillDir: 'apps/x/.cursor/skills/s',
    });
  });

  it('assigns member files to the deepest skill folder', () => {
    const { discovered } = classify([
      '.cursor/skills/a/SKILL.md',
      '.cursor/skills/a/ref.md',
      '.cursor/skills/a/b/SKILL.md',
      '.cursor/skills/a/b/scripts/run.sh',
    ]);
    const byDir = Object.fromEntries(discovered.map((d) => [d.skillDir, d.memberFiles]));
    expect(byDir['.cursor/skills/a']).toEqual(['.cursor/skills/a/ref.md']);
    expect(byDir['.cursor/skills/a/b']).toEqual(['.cursor/skills/a/b/scripts/run.sh']);
  });

  it('diagnoses near-misses instead of discovering them', () => {
    const { discovered, diagnostics } = classify([
      'docs/SKILL.md',
      'overlays/typescript/skills/stack-commands/SKILL.md',
      '.cursor/skills/SKILL.md',
      '.cursor/rules/notes.md',
      'agents.md',
      '.cursor/agents/sub/deep.md',
    ]);
    expect(discovered).toEqual([]);
    expect(diagnostics.map((d) => [d.code, d.path])).toEqual([
      ['rule-not-mdc', '.cursor/rules/notes.md'],
      ['skill-outside-root', '.cursor/skills/SKILL.md'],
      ['agents-md-case', 'agents.md'],
      ['skill-outside-root', 'docs/SKILL.md'],
      ['skill-outside-root', 'overlays/typescript/skills/stack-commands/SKILL.md'],
    ]);
  });

  it('flags nested rules and agents as unverified', () => {
    const { discovered, diagnostics } = classify([
      'pkg/.cursor/rules/r.mdc',
      'pkg/.cursor/agents/a.md',
    ]);
    expect(discovered.map((d) => d.scope)).toEqual(['pkg', 'pkg']);
    expect(diagnostics.map((d) => d.code).sort()).toEqual([
      'unverified-nested-agents',
      'unverified-nested-rules',
    ]);
  });
});
