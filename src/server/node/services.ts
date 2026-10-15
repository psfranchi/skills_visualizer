import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { type AgentGraph, decodeUtf8Strict, SCHEMA_VERSION, sha256Hex } from '../../core';
import { scan } from '../../scanner';
import type { Services } from '../app';
import { LocalFileSource } from './local-file-source';
import { stateBaseDir, ViewStateStore, viewStateFile } from './view-state-store';

export interface LocalServicesOptions {
  /** Defaults to `stateBaseDir()` (SV_STATE_DIR / XDG / macOS Application Support). */
  stateDir?: string;
}

/** Read-only services over a local directory; only the view state is written, outside the repo. */
export async function createLocalServices(
  root: string,
  options: LocalServicesOptions = {},
): Promise<Services> {
  const realRoot = await realpath(path.resolve(root));
  let source = await LocalFileSource.open(realRoot);
  let graph: Promise<AgentGraph> | undefined;
  const store = new ViewStateStore(viewStateFile(options.stateDir ?? stateBaseDir(), realRoot));

  return {
    meta: async () => ({
      displayName: path.basename(realRoot),
      capabilities: source.capabilities,
      schemaVersion: SCHEMA_VERSION,
    }),
    graph: async (opts) => {
      if (opts?.rescan || !graph) {
        if (opts?.rescan) source = await LocalFileSource.open(realRoot);
        graph = scan(source);
      }
      return graph;
    },
    file: async (repoPath) => {
      const bytes = await source.read(repoPath);
      if (!bytes) return null;
      const decoded = decodeUtf8Strict(bytes);
      return decoded.ok ? { text: decoded.text, hash: await sha256Hex(bytes) } : null;
    },
    getView: () => store.read(),
    putView: (view) => store.write(view),
  };
}
