import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { emptyViewState, type GraphViewState, GraphViewStateSchema } from '../../core';

const APP_DIR = 'skills-visualizer';

/**
 * Base directory for per-repo state, never inside the repo: `SV_STATE_DIR` if set; macOS
 * `~/Library/Application Support/skills-visualizer`; otherwise
 * `${XDG_STATE_HOME:-~/.local/state}/skills-visualizer` (a relative XDG_STATE_HOME is ignored).
 */
export function stateBaseDir(
  env: Readonly<Record<string, string | undefined>> = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  if (env.SV_STATE_DIR) return path.resolve(env.SV_STATE_DIR);
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', APP_DIR);
  const xdg = env.XDG_STATE_HOME;
  const base = xdg && path.isAbsolute(xdg) ? xdg : path.join(home, '.local', 'state');
  return path.join(base, APP_DIR);
}

/** `<base>/<sha256(realRoot)>/view.json` */
export function viewStateFile(baseDir: string, realRoot: string): string {
  const key = createHash('sha256').update(realRoot).digest('hex');
  return path.join(baseDir, key, 'view.json');
}

export class ViewStateStore {
  /** Serializes writes so an older save cannot land after a newer one (e.g. Reset layout). */
  #writeChain: Promise<unknown> = Promise.resolve();

  constructor(readonly file: string) {}

  /** Missing or invalid state reads as empty. */
  async read(): Promise<GraphViewState> {
    try {
      const parsed = GraphViewStateSchema.safeParse(JSON.parse(await readFile(this.file, 'utf8')));
      return parsed.success ? parsed.data : emptyViewState();
    } catch {
      return emptyViewState();
    }
  }

  /** Atomic replace: temp file in the same directory, then rename. Queued with prior writes. */
  write(view: GraphViewState): Promise<void> {
    const run = this.#writeChain.then(() => this.#writeOnce(view));
    this.#writeChain = run.catch(() => {});
    return run;
  }

  async #writeOnce(view: GraphViewState): Promise<void> {
    const dir = path.dirname(this.file);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const temp = path.join(dir, `.view.${randomUUID()}.tmp`);
    try {
      await writeFile(temp, `${JSON.stringify(GraphViewStateSchema.parse(view))}\n`, {
        mode: 0o600,
      });
      await rename(temp, this.file);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }
}
