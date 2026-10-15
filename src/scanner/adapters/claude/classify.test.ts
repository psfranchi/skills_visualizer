import { describe, expect, it } from 'vitest';
import type { RepoPath } from '../../../core';
import { classifyClaudePaths } from './classify';

function classify(paths: string[]) {
  return classifyClaudePaths((paths as RepoPath[]).sort());
}

describe('classifyClaudePaths', () => {
  it('surfaces .claude/rules as unverified diagnostics only (no rule nodes)', () => {
    const { discovered, diagnostics } = classify([
      '.claude/rules/style.md',
      '.claude/rules/nested/path.md',
      '.claude/skills/ok/SKILL.md',
    ]);
    expect(discovered.map((d) => [d.kind, d.path])).toEqual([
      ['skill', '.claude/skills/ok/SKILL.md'],
    ]);
    expect(diagnostics.map((d) => [d.code, d.path]).sort()).toEqual([
      ['unverified-claude-rules', '.claude/rules/nested/path.md'],
      ['unverified-claude-rules', '.claude/rules/style.md'],
    ]);
    expect(discovered.every((d) => d.kind !== 'rule')).toBe(true);
  });
});
