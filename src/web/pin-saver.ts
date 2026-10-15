export interface SaverDeps<T> {
  save(value: T): void;
  /** Used when the page is going away; must survive unload (e.g. `fetch` with `keepalive`). */
  saveOnExit(value: T): void;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

/** Debounced saves; the latest pending value wins and is saved at most once. */
export class DebouncedSaver<T> {
  private pending: { value: T } | null = null;
  private timer: unknown;

  constructor(
    private readonly deps: SaverDeps<T>,
    private readonly delayMs: number,
  ) {}

  schedule(value: T): void {
    this.cancel();
    this.pending = { value };
    this.timer = this.deps.setTimer(() => {
      const pending = this.take();
      if (pending) this.deps.save(pending.value);
    }, this.delayMs);
  }

  /** Saves `value` now, superseding anything pending. */
  flush(value: T): void {
    this.take();
    this.deps.save(value);
  }

  /** Saves the pending value, if any, in a way that survives page unload. */
  flushOnExit(): void {
    const pending = this.take();
    if (pending) this.deps.saveOnExit(pending.value);
  }

  dispose(): void {
    this.cancel();
  }

  private take(): { value: T } | null {
    this.cancel();
    const pending = this.pending;
    this.pending = null;
    return pending;
  }

  private cancel(): void {
    if (this.timer !== undefined) this.deps.clearTimer(this.timer);
    this.timer = undefined;
  }
}
