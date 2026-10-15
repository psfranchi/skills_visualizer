import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RepoPath } from '../../core';
import { scan } from '../../scanner';
import { directoryHash } from '../../test-support/directory-hash';
import { fixtureDir, loadFixture, materializeFixture } from '../../test-support/fixtures';
import { LocalFileSource, MAX_FILE_BYTES } from './local-file-source';

describe('LocalFileSource', () => {
  let root = '';
  let outside = '';

  beforeAll(async () => {
    root = await materializeFixture('cursor-edge');
    outside = await mkdtemp(path.join(tmpdir(), 'sv-outside-'));
    await writeFile(path.join(outside, 'secret.md'), 'outside the root');
    await symlink(path.join(outside, 'secret.md'), path.join(root, 'escape-link.md'));
    await symlink(outside, path.join(root, 'escape-dir'));
    await symlink(path.join(root, 'docs', 'SKILL.md'), path.join(root, 'inside-link.md'));
    await mkdir(path.join(root, 'big'), { recursive: true });
    await writeFile(path.join(root, 'big', 'huge.md'), Buffer.alloc(MAX_FILE_BYTES + 1, 0x61));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('applies the ignore list, keeps dot dirs, and never lists symlinks or huge files', async () => {
    const source = await LocalFileSource.open(root);
    const paths = await source.list();
    expect(paths).toContain('.cursor/skills/cycle-a/SKILL.md');
    expect(paths).toContain('apps/x/.cursor/skills/scoped-skill/SKILL.md');
    expect(paths.some((p) => p.startsWith('node_modules/'))).toBe(false);
    expect(
      paths.some((p) => p.includes('escape') || p.includes('inside-link') || p.includes('huge')),
    ).toBe(false);
    expect(paths.some((p) => p.startsWith('escape-dir/'))).toBe(false);
    const diagnostics = await source.diagnostics();
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'file-too-large', path: 'big/huge.md' }),
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain(outside);
  });

  it('refuses reads through symlinks, traversal, absolute paths, and oversized files', async () => {
    const source = await LocalFileSource.open(root);
    for (const bad of [
      'escape-link.md',
      'escape-dir/secret.md',
      '../outside.md',
      '/etc/passwd',
      'a/%2e%2e/b',
      'big/huge.md',
    ]) {
      expect(await source.read(bad as RepoPath), bad).toBeNull();
    }
    expect(await source.read('docs/SKILL.md' as RepoPath)).not.toBeNull();
  });

  it('produces the same graph as the in-memory fixture (apart from source id)', async () => {
    const local = await scan(await LocalFileSource.open(await materializeFixtureOnce()));
    const memory = await scan(loadFixture('cursor-basic'));
    expect({ ...local, source: null }).toEqual({ ...memory, source: null });
    expect(local.source.id).toMatch(/^local:\//);
  });

  it('leaves the scanned directories byte-identical', async () => {
    for (const dir of [root, fixtureDir('cursor-basic'), fixtureDir('cursor-edge')]) {
      const before = await directoryHash(dir);
      await scan(await LocalFileSource.open(dir));
      expect(await directoryHash(dir)).toBe(before);
    }
  });

  it('advertises write capability', async () => {
    expect((await LocalFileSource.open(root)).capabilities).toEqual({ write: true, watch: false });
  });

  it('replaces a file only when the hash matches, preserving mode and refusing symlinks', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'sv-write-'));
    const skill = path.join(dir, '.cursor', 'skills', 'demo');
    await mkdir(skill, { recursive: true });
    const target = path.join(skill, 'SKILL.md');
    const original = '---\nname: demo\ndescription: before\n---\n# Demo\n';
    await writeFile(target, original, { mode: 0o640 });
    const source = await LocalFileSource.open(dir);
    const repoPath = '.cursor/skills/demo/SKILL.md' as RepoPath;
    const bytes = new TextEncoder().encode(original);
    const { sha256Hex } = await import('../../core');
    const hash = await sha256Hex(bytes);
    const next = new TextEncoder().encode('---\nname: demo\ndescription: after\n---\n# Demo\n');

    const conflict = await source.replaceIfUnchanged(repoPath, '0'.repeat(64), next);
    expect(conflict).toEqual({ ok: false, reason: 'conflict', currentHash: hash });
    expect(await readFile(target, 'utf8')).toBe(original);

    const ok = await source.replaceIfUnchanged(repoPath, hash, next);
    expect(ok.ok).toBe(true);
    expect(await readFile(target, 'utf8')).toBe(
      '---\nname: demo\ndescription: after\n---\n# Demo\n',
    );
    expect((await lstat(target)).mode & 0o777).toBe(0o640);

    await symlink(target, path.join(dir, 'link.md'));
    expect(await source.replaceIfUnchanged('link.md' as RepoPath, hash, next)).toEqual({
      ok: false,
      reason: 'missing',
    });

    await rm(dir, { recursive: true, force: true });
  });
});

let basicDir: string | undefined;
async function materializeFixtureOnce(): Promise<string> {
  basicDir ??= await materializeFixture('cursor-basic');
  return basicDir;
}
afterAll(async () => {
  if (basicDir) await rm(basicDir, { recursive: true, force: true });
});
