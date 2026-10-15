import { readdirSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryFileSource } from '../core';

/**
 * Fixtures are stored with renamed agent-config names so Cursor never loads them as real config.
 * This is the single mapping table: stored path segment → real segment (applied to every segment).
 */
export const FIXTURE_NAME_MAP: Readonly<Record<string, string>> = {
  'dot-cursor': '.cursor',
  'dot-agents': '.agents',
  'dot-claude': '.claude',
  'dot-codex': '.codex',
  'AGENTS.fixture.md': 'AGENTS.md',
  'CLAUDE.fixture.md': 'CLAUDE.md',
};

const REVERSE_NAME_MAP: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(FIXTURE_NAME_MAP).map(([stored, real]) => [real, stored]),
);

/** Files at a fixture's top level that are test metadata, not fixture content. */
export const FIXTURE_METADATA_FILES = ['expected.graph.json'] as const;

export const FIXTURES_DIR = fileURLToPath(new URL('../../fixtures/', import.meta.url));

export type FixtureName = 'cursor-basic' | 'cursor-edge' | 'agentic-base-snapshot';

function mapSegments(posixPath: string, table: Readonly<Record<string, string>>): string {
  return posixPath
    .split('/')
    .map((segment) => table[segment] ?? segment)
    .join('/');
}

/** `dot-cursor/skills/x/SKILL.md` → `.cursor/skills/x/SKILL.md` */
export function toRealPath(storedPath: string): string {
  return mapSegments(storedPath, FIXTURE_NAME_MAP);
}

/** Inverse of `toRealPath`. */
export function toStoredPath(realPath: string): string {
  return mapSegments(realPath, REVERSE_NAME_MAP);
}

export function fixtureDir(name: FixtureName): string {
  return path.join(FIXTURES_DIR, name);
}

/** Fixture files keyed by real (mapped) POSIX path, sorted, metadata excluded. */
export function readFixtureFiles(name: FixtureName): Map<string, Uint8Array> {
  const root = fixtureDir(name);
  const entries = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'),
    )
    .filter((stored) => !(FIXTURE_METADATA_FILES as readonly string[]).includes(stored))
    .sort();
  return new Map(
    entries.map((stored) => [toRealPath(stored), readFileSync(path.join(root, stored))]),
  );
}

/** In-memory source with real agent-config names and a deterministic id (`memory:fixture/<name>`). */
export function loadFixture(name: FixtureName): MemoryFileSource {
  return new MemoryFileSource(readFixtureFiles(name), { id: `memory:fixture/${name}` });
}

/** Copies a fixture to a new temp dir using real names. The caller removes the directory. */
export async function materializeFixture(name: FixtureName): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `sv-${name}-`));
  for (const [realPath, bytes] of readFixtureFiles(name)) {
    const target = path.join(dir, ...realPath.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  return dir;
}
