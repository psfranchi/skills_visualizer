import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/** Hash of every path, size, mtime, and content under `dir` (symlinks by target string). */
export async function directoryHash(dir: string): Promise<string> {
  const hash = createHash('sha256');
  const entries = (await readdir(dir, { recursive: true, withFileTypes: true }))
    .map((e) => path.join(e.parentPath, e.name))
    .sort();
  for (const entry of entries) {
    const info = await stat(entry).catch(() => null);
    hash.update(`${path.relative(dir, entry)}\0${info?.size}\0${info?.mtimeMs}\0`);
    if (info?.isFile()) hash.update(await readFile(entry));
  }
  return hash.digest('hex');
}
