import { describe, expect, it } from 'vitest';
import {
  dirname,
  InvalidRepoPathError,
  isIgnoredPath,
  isWithin,
  normalizeRepoPath,
  type RepoPath,
  ROOT_DIR,
  resolveRepoPath,
} from './paths';

const p = (value: string) => value as RepoPath;

describe('normalizeRepoPath', () => {
  it.each([
    ['a/b.md', 'a/b.md'],
    ['./a//b/', 'a/b'],
    ['.cursor/skills/x/SKILL.md', '.cursor/skills/x/SKILL.md'],
    ['.', '.'],
    ['a/./b', 'a/b'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeRepoPath(input)).toBe(expected);
  });

  it.each([
    ['', 'empty'],
    ['/etc/passwd', 'absolute'],
    ['C:/Windows', 'absolute'],
    ['~/secrets', 'absolute'],
    ['../outside', 'traversal'],
    ['a/../../b', 'traversal'],
    ['a/%2e%2e/b', 'traversal'],
    ['%2E%2E/b', 'traversal'],
    ['a/%2fetc', 'encoded separator'],
    ['a/%5c..', 'encoded separator'],
    ['a\\b', 'backslash'],
    ['a\0b', 'NUL byte'],
  ])('rejects %j (%s)', (input, reason) => {
    expect(() => normalizeRepoPath(input)).toThrow(InvalidRepoPathError);
    try {
      normalizeRepoPath(input);
    } catch (error) {
      expect((error as InvalidRepoPathError).reason).toBe(reason);
    }
  });

  it('keeps path identity case-sensitive (macOS filesystems may not be)', () => {
    expect(normalizeRepoPath('AGENTS.md')).not.toBe(normalizeRepoPath('agents.md'));
  });
});

describe('resolveRepoPath', () => {
  it('resolves relative, parent, and root-anchored targets', () => {
    expect(resolveRepoPath(p('a/b'), 'c.md')).toBe('a/b/c.md');
    expect(resolveRepoPath(p('a/b'), '../c.md')).toBe('a/c.md');
    expect(resolveRepoPath(p('a/b'), '/docs/x.md')).toBe('docs/x.md');
    expect(resolveRepoPath(ROOT_DIR, './x/')).toBe('x');
    expect(resolveRepoPath(p('a'), '..')).toBe('.');
  });

  it('returns null when the target escapes the root', () => {
    expect(resolveRepoPath(ROOT_DIR, '../x')).toBeNull();
    expect(resolveRepoPath(p('a'), '../../x')).toBeNull();
  });
});

describe('path helpers', () => {
  it('dirname and isWithin', () => {
    expect(dirname(p('a/b/c.md'))).toBe('a/b');
    expect(dirname(p('c.md'))).toBe('.');
    expect(isWithin(p('a/b/c'), p('a/b'))).toBe(true);
    expect(isWithin(p('a/bc'), p('a/b'))).toBe(false);
    expect(isWithin(p('anything'), ROOT_DIR)).toBe(true);
  });

  it('isIgnoredPath matches ignored directory names at any depth only', () => {
    expect(isIgnoredPath(p('node_modules/x/SKILL.md'))).toBe(true);
    expect(isIgnoredPath(p('apps/web/dist/index.js'))).toBe(true);
    expect(isIgnoredPath(p('.git/config'))).toBe(true);
    expect(isIgnoredPath(p('.cursor/skills/x/SKILL.md'))).toBe(false);
    expect(isIgnoredPath(p('docs/distribution.md'))).toBe(false);
  });
});
