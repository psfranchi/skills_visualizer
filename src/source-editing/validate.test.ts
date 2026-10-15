import { describe, expect, it } from 'vitest';
import type { RepoPath } from '../core';
import { validateSkillBytes } from './validate';

const enc = new TextEncoder();
const PATH = '.cursor/skills/demo/SKILL.md' as RepoPath;
const PATHS = [PATH] as RepoPath[];

describe('validateSkillBytes', () => {
  it('allows a well-formed skill and returns only non-blocking warnings for spec issues', async () => {
    const ok = await validateSkillBytes(
      PATH,
      enc.encode('---\nname: demo\ndescription: Fine.\n---\n'),
      PATHS,
    );
    expect(ok.blocking).toBe(false);

    const mismatch = await validateSkillBytes(
      PATH,
      enc.encode('---\nname: other\ndescription: Fine.\n---\n'),
      PATHS,
    );
    expect(mismatch.blocking).toBe(false);
    expect(mismatch.diagnostics.some((d) => d.code === 'skill-name-mismatch')).toBe(true);
  });

  it('blocks malformed YAML frontmatter', async () => {
    const bad = await validateSkillBytes(
      PATH,
      enc.encode('---\nname: [unterminated\ndescription: x\n---\n'),
      PATHS,
    );
    expect(bad.blocking).toBe(true);
    expect(bad.diagnostics.some((d) => d.code === 'malformed-frontmatter')).toBe(true);
  });

  it('blocks paths that are not discovered skills', async () => {
    const result = await validateSkillBytes('docs/readme.md' as RepoPath, enc.encode('# hi\n'), [
      'docs/readme.md',
    ] as RepoPath[]);
    expect(result.blocking).toBe(true);
    expect(result.diagnostics[0]?.code).toBe('not-editable');
  });
});
