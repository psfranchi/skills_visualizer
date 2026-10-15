import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  FIXTURE_NAME_MAP,
  fixtureDir,
  loadFixture,
  materializeFixture,
  readFixtureFiles,
  toRealPath,
  toStoredPath,
} from './fixtures';

const STORED_NAMES = Object.keys(FIXTURE_NAME_MAP);

describe('fixture name mapping', () => {
  it.each([
    ['dot-cursor/skills/x/SKILL.md', '.cursor/skills/x/SKILL.md'],
    ['apps/x/dot-cursor/skills/s/SKILL.md', 'apps/x/.cursor/skills/s/SKILL.md'],
    ['AGENTS.fixture.md', 'AGENTS.md'],
    ['pkg/AGENTS.fixture.md', 'pkg/AGENTS.md'],
    ['dot-agents/skills/a/SKILL.md', '.agents/skills/a/SKILL.md'],
    ['dot-claude/CLAUDE.fixture.md', '.claude/CLAUDE.md'],
    ['dot-codex/agents/a.md', '.codex/agents/a.md'],
    ['docs/dot-cursor-notes.md', 'docs/dot-cursor-notes.md'],
    ['docs/SKILL.md', 'docs/SKILL.md'],
  ])('maps %j ↔ %j', (stored, real) => {
    expect(toRealPath(stored)).toBe(real);
    expect(toStoredPath(real)).toBe(stored);
  });

  it('loadFixture exposes real names only, excludes metadata, and uses a fixed id', async () => {
    const source = loadFixture('cursor-basic');
    const paths = await source.list();
    expect(source.id).toBe('memory:fixture/cursor-basic');
    expect(paths).toContain('AGENTS.md');
    expect(paths).toContain('.cursor/mcp.json');
    expect(paths).not.toContain('expected.graph.json');
    for (const p of paths) {
      for (const segment of p.split('/')) expect(STORED_NAMES).not.toContain(segment);
    }
  });

  describe('materializeFixture', () => {
    let dir = '';
    afterAll(async () => {
      if (dir) await rm(dir, { recursive: true, force: true });
    });

    it('copies the fixture byte-for-byte under real names', async () => {
      dir = await materializeFixture('cursor-edge');
      const crlf = await readFile(path.join(dir, '.cursor/skills/crlf-skill/SKILL.md'));
      const stored = await readFile(
        path.join(fixtureDir('cursor-edge'), 'dot-cursor/skills/crlf-skill/SKILL.md'),
      );
      expect(Buffer.compare(crlf, stored)).toBe(0);
      expect((await stat(path.join(dir, 'AGENTS.md'))).isFile()).toBe(true);
      await expect(stat(path.join(dir, 'dot-cursor'))).rejects.toThrow();
    });
  });
});

const BOM = [0xef, 0xbb, 0xbf];

function startsWithBom(bytes: Uint8Array): boolean {
  return BOM.every((b, i) => bytes[i] === b);
}

function lineEndings(bytes: Uint8Array): { crlf: number; bareLf: number } {
  let crlf = 0;
  let bareLf = 0;
  bytes.forEach((b, i) => {
    if (b !== 0x0a) return;
    if (bytes[i - 1] === 0x0d) crlf++;
    else bareLf++;
  });
  return { crlf, bareLf };
}

describe('cursor-edge fixture encodings stay byte-exact', () => {
  const edge = readFixtureFiles('cursor-edge');
  const bytes = (realPath: string) => edge.get(realPath) ?? new Uint8Array();

  it.each(['AGENTS.md', '.cursor/skills/crlf-skill/SKILL.md', '.cursor/rules/bom-rule.mdc'])(
    '%s uses CRLF only',
    (realPath) => {
      const { crlf, bareLf } = lineEndings(bytes(realPath));
      expect(crlf).toBeGreaterThan(0);
      expect(bareLf).toBe(0);
    },
  );

  it.each(['.cursor/skills/bom-skill/SKILL.md', '.cursor/rules/bom-rule.mdc'])(
    '%s starts with a UTF-8 BOM',
    (realPath) => {
      expect(startsWithBom(bytes(realPath))).toBe(true);
    },
  );

  it('LF fixtures have no BOM and no CRLF', () => {
    const lf =
      readFixtureFiles('cursor-basic').get('.cursor/skills/code-review/SKILL.md') ??
      new Uint8Array();
    expect(startsWithBom(lf)).toBe(false);
    expect(lineEndings(lf).crlf).toBe(0);
  });
});
