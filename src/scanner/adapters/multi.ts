import type { GraphFragment, RepoPath } from '../../core';
import type { ClassifyResult, ClientAdapter, Discovered, LoadedFile } from '../adapter';
import { nameShadowing } from '../shadowing';
import { claudeAdapter } from './claude';
import { codexAdapter } from './codex';
import { cursorAdapter } from './cursor';
import { globApplyFragment } from './cursor/glob-edges';

export const ENGINE_ADAPTERS = [cursorAdapter, claudeAdapter, codexAdapter] as const;

/** Ids of per-engine adapters (excludes the `multi` composite). */
export const SUPPORTED_ADAPTERS = ENGINE_ADAPTERS.map((a) => a.id);

function byId(id: string): ClientAdapter {
  const adapter = ENGINE_ADAPTERS.find((a) => a.id === id);
  if (!adapter) throw new Error(`Unknown adapter ${id}`);
  return adapter;
}

/** Merge per-engine classify results; first claimer wins on duplicate paths. */
export function classifyAll(paths: readonly RepoPath[]): ClassifyResult {
  const claimed = new Set<string>();
  const discovered: Discovered[] = [];
  const diagnostics = [];
  for (const adapter of ENGINE_ADAPTERS) {
    const result = adapter.classify(paths);
    diagnostics.push(...result.diagnostics);
    for (const item of result.discovered) {
      if (claimed.has(item.path)) continue;
      claimed.add(item.path);
      discovered.push(item);
    }
  }
  discovered.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { discovered, diagnostics };
}

function parse(d: Discovered, file: LoadedFile): GraphFragment {
  return byId(d.adapterId).parse(d, file);
}

/** Runs Cursor + Claude + Codex adapters into one merged graph. */
export const multiEngineAdapter: ClientAdapter = {
  id: 'multi',
  version: '0.2.0',
  classify: classifyAll,
  parse,
  finalize: nameShadowing,
  enrich: globApplyFragment,
  editable: (d) => byId(d.adapterId).editable(d),
};
