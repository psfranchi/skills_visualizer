import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FileSource, MemoryFileSource } from '../../core';
import { createLocalServices } from './services';

/** A source whose first `list()` fails, as with a transient I/O error. */
function flakySource(): FileSource {
  const inner = new MemoryFileSource(new Map([['AGENTS.md', '# Agents\n']]), { id: 'memory:x' });
  let failures = 1;
  return {
    id: inner.id,
    capabilities: inner.capabilities,
    list: () => (failures-- > 0 ? Promise.reject(new Error('EIO')) : inner.list()),
    read: (p) => inner.read(p),
  };
}

describe('createLocalServices', () => {
  let dir = '';

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'sv-services-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('does not cache a failed scan', async () => {
    const source = flakySource();
    const services = await createLocalServices(dir, {
      stateDir: path.join(dir, 'state'),
      openSource: async () => source,
    });
    await expect(services.graph()).rejects.toThrow('EIO');
    const graph = await services.graph();
    expect(graph.nodes.some((n) => n.kind === 'instruction')).toBe(true);
  });
});
