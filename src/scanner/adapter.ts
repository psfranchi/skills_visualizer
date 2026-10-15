import type { GraphDiagnostic, GraphFragment, RepoPath } from '../core';

export type ConfigRoot = '.cursor' | '.agents' | '.claude' | '.codex';

export interface Discovered {
  kind: 'instruction' | 'rule' | 'skill' | 'agent' | 'mcp-config';
  /** File to read and parse. */
  path: RepoPath;
  /** Directory the config applies to: `.` for repo-level roots, `apps/x` for `apps/x/.cursor/...`. */
  scope: RepoPath;
  /** Discovery root, when the file lives under one. */
  root?: ConfigRoot;
  /** Skills only: the skill folder and the files it contains (excluding `SKILL.md` and nested skills). */
  skillDir?: RepoPath;
  memberFiles?: RepoPath[];
}

export interface LoadedFile {
  path: RepoPath;
  /** Decoded UTF-8 text, BOM stripped. */
  text: string;
  bom: boolean;
  contentHash: string;
}

export interface ClassifyResult {
  discovered: Discovered[];
  diagnostics: GraphDiagnostic[];
}

export interface ClientAdapter {
  readonly id: string;
  readonly version: string;
  /** Pure path predicates; never reads files. */
  classify(paths: readonly RepoPath[]): ClassifyResult;
  parse(discovered: Discovered, file: LoadedFile): GraphFragment;
  /** Cross-file checks after all parses (e.g. agent name shadowing). */
  finalize?(fragments: readonly GraphFragment[]): GraphDiagnostic[];
  /**
   * Optional second pass with the discovered file list (e.g. glob/paths match edges).
   * Matching is against this list only — no filesystem walk.
   */
  enrich?(fragments: readonly GraphFragment[], files: readonly RepoPath[]): GraphFragment;
  /** M3: whether the file may be edited through the app. */
  editable(discovered: Discovered): boolean;
}
