import { describe, expect, it } from 'vitest';
import { DebouncedSaver } from './pin-saver';

function harness(options?: { asyncSave?: boolean }) {
  const saved: string[] = [];
  const exitSaved: string[] = [];
  const timers = new Map<number, () => void>();
  let nextId = 0;
  let resolveInFlight: (() => void) | null = null;
  const saver = new DebouncedSaver<string>(
    {
      save: (v) => {
        saved.push(v);
        if (!options?.asyncSave) return;
        return new Promise<void>((resolve) => {
          resolveInFlight = resolve;
        });
      },
      saveOnExit: (v) => exitSaved.push(v),
      setTimer: (callback) => {
        timers.set(++nextId, callback);
        return nextId;
      },
      clearTimer: (handle) => timers.delete(handle as number),
    },
    500,
  );
  const fire = () => {
    for (const [id, callback] of [...timers]) {
      timers.delete(id);
      callback();
    }
  };
  const settle = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };
  return {
    saver,
    saved,
    exitSaved,
    timers,
    fire,
    settle,
    releaseInFlight: () => {
      const resolve = resolveInFlight;
      resolveInFlight = null;
      resolve?.();
    },
  };
}

describe('DebouncedSaver', () => {
  it('saves only the latest scheduled value after the delay', async () => {
    const h = harness();
    h.saver.schedule('a');
    h.saver.schedule('b');
    expect(h.timers.size).toBe(1);
    h.fire();
    await h.settle();
    expect(h.saved).toEqual(['b']);
  });

  it('flushes the pending value on exit exactly once', () => {
    const h = harness();
    h.saver.schedule('a');
    h.saver.flushOnExit();
    h.saver.flushOnExit();
    h.fire();
    expect(h.exitSaved).toEqual(['a']);
    expect(h.saved).toEqual([]);
  });

  it('does nothing on exit when nothing is pending', async () => {
    const h = harness();
    h.saver.schedule('a');
    h.fire();
    await h.settle();
    h.saver.flushOnExit();
    expect(h.saved).toEqual(['a']);
    expect(h.exitSaved).toEqual([]);
  });

  it('a reset flush supersedes a pending save', async () => {
    const h = harness();
    h.saver.schedule('a');
    h.saver.flush('reset');
    h.fire();
    await h.settle();
    h.saver.flushOnExit();
    expect(h.saved).toEqual(['reset']);
    expect(h.exitSaved).toEqual([]);
  });

  it('flush during in-flight waits then writes the flush value', async () => {
    const h = harness({ asyncSave: true });
    h.saver.schedule('pins');
    h.fire();
    await h.settle();
    expect(h.saved).toEqual(['pins']);
    h.saver.flush('reset');
    await h.settle();
    expect(h.saved).toEqual(['pins']);
    h.releaseInFlight();
    await h.settle();
    expect(h.saved).toEqual(['pins', 'reset']);
  });

  it('dispose flushes pending via exit and cancels the timer', () => {
    const h = harness();
    h.saver.schedule('a');
    h.saver.dispose();
    expect(h.timers.size).toBe(0);
    expect(h.exitSaved).toEqual(['a']);
    expect(h.saved).toEqual([]);
  });

  it('dispose on exit prefers queued flush over a cleared debounce', async () => {
    const h = harness({ asyncSave: true });
    h.saver.schedule('pins');
    h.fire();
    await h.settle();
    h.saver.flush('reset');
    h.saver.dispose();
    expect(h.exitSaved).toEqual(['reset']);
    h.releaseInFlight();
    await h.settle();
    // In-flight 'pins' may still complete; reset was also sent on exit.
    expect(h.saved[0]).toBe('pins');
  });
});
