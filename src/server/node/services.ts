import { realpath } from 'node:fs/promises';
import path from 'node:path';
import {
  type AgentGraph,
  decodeUtf8Strict,
  type FileSource,
  SCHEMA_VERSION,
  sha256Hex,
} from '../../core';
import { scan } from '../../scanner';
import type { Services } from '../app';
import { LocalFileSource } from './local-file-source';
import { stateBaseDir, ViewStateStore, viewStateFile } from './view-state-store';

export interface LocalServicesOptions {
  /** Defaults to `stateBaseDir()` (SV_STATE_DIR / XDG / macOS Application Support). */
  stateDir?: string;
  /** Defaults to `LocalFileSource.open`; tests substitute failing or memory sources. */
  openSource?: (realRoot: string) => Promise<FileSource>;
}

/** Local services over a directory; view state is written outside the repo; skills may be edited. */
export async function createLocalServices(
  root: string,
  options: LocalServicesOptions = {},
): Promise<Services> {
  const realRoot = await realpath(path.resolve(root));
  const openSource = options.openSource ?? ((dir: string) => LocalFileSource.open(dir));
  let source = await openSource(realRoot);
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
        if (opts?.rescan) source = await openSource(realRoot);
        const pending: Promise<AgentGraph> = scan(source).catch((error: unknown) => {
          if (graph === pending) graph = undefined;
          throw error;
        });
        graph = pending;
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
    source: () => source,
    invalidateGraph: () => {
      graph = undefined;
    },
  };
}
