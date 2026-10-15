import { describe, expect, it } from 'vitest';
import { MemoryFileSource } from './memory-file-source';
import type { RepoPath } from './paths';

describe('MemoryFileSource', () => {
  it('lists sorted files, applies the ignore list, and reads copies', async () => {
    const source = new MemoryFileSource(
      { 'b.md': 'b', './a.md': 'a', 'node_modules/x/SKILL.md': 'x' },
      { id: 'memory:test' },
    );
    expect(source.id).toBe('memory:test');
    expect(source.capabilities).toEqual({ write: false, watch: false });
    expect(await source.list()).toEqual(['a.md', 'b.md']);
    expect(new TextDecoder().decode((await source.read('a.md' as RepoPath)) ?? undefined)).toBe(
      'a',
    );
    expect(await source.read('node_modules/x/SKILL.md' as RepoPath)).toBeNull();
    expect(await source.read('missing.md' as RepoPath)).toBeNull();
  });

  it('rejects paths that escape the root', () => {
    expect(() => new MemoryFileSource({ '../x.md': 'x' })).toThrow(/traversal/);
  });

  it('generates a memory: id by default', () => {
    expect(new MemoryFileSource({}).id).toMatch(/^memory:[0-9a-f-]{36}$/);
  });
});
