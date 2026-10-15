export interface SaverDeps<T> {
  /** May return a Promise; only one save runs at a time (latest queued value wins). */
  save(value: T): void | Promise<void>;
  /** Used when the page is going away; must survive unload (e.g. `fetch` with `keepalive`). */
  saveOnExit(value: T): void;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

/**
 * Debounced saves with single-flight writes: a Reset `flush` waits for any in-flight
 * PUT to finish, then writes the flush value so a stale pin save cannot land last.
 */
export class DebouncedSaver<T> {
  private pending: { value: T } | null = null;
  private timer: unknown;
  /** Value waiting to be written after the current in-flight save (if any). */
  private queued: { value: T } | null = null;
  private writing = false;

  constructor(
    private readonly deps: SaverDeps<T>,
    private readonly delayMs: number,
  ) {}

  schedule(value: T): void {
    this.cancelTimer();
    this.pending = { value };
    this.timer = this.deps.setTimer(() => {
      this.timer = undefined;
      const pending = this.pending;
      this.pending = null;
      if (pending) this.enqueue(pending.value);
    }, this.delayMs);
  }

  /** Saves `value` now (after any in-flight write), superseding anything pending. */
  flush(value: T): void {
    this.cancelTimer();
    this.pending = null;
    this.enqueue(value);
  }

  /** Saves the latest pending/queued value, if any, in a way that survives page unload. */
  flushOnExit(): void {
    this.cancelTimer();
    const value = this.pending?.value ?? this.queued?.value;
    this.pending = null;
    this.queued = null;
    if (value !== undefined) this.deps.saveOnExit(value);
  }

  /** Flush any pending debounce via exit path, then stop. */
  dispose(): void {
    this.flushOnExit();
  }

  private enqueue(value: T): void {
    this.queued = { value };
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.writing) return;
    while (this.queued) {
      const { value } = this.queued;
      this.queued = null;
      this.writing = true;
      try {
        await Promise.resolve(this.deps.save(value));
      } finally {
        this.writing = false;
      }
    }
  }

  private cancelTimer(): void {
    if (this.timer !== undefined) this.deps.clearTimer(this.timer);
    this.timer = undefined;
  }
}
