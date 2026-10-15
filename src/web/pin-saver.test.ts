import { describe, expect, it } from 'vitest';
import { DebouncedSaver } from './pin-saver';

function harness() {
  const saved: string[] = [];
  const exitSaved: string[] = [];
  const timers = new Map<number, () => void>();
  let nextId = 0;
  const saver = new DebouncedSaver<string>(
    {
      save: (v) => saved.push(v),
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
  return { saver, saved, exitSaved, timers, fire };
}

describe('DebouncedSaver', () => {
  it('saves only the latest scheduled value after the delay', () => {
    const h = harness();
    h.saver.schedule('a');
    h.saver.schedule('b');
    expect(h.timers.size).toBe(1);
    h.fire();
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

  it('does nothing on exit when nothing is pending', () => {
    const h = harness();
    h.saver.schedule('a');
    h.fire();
    h.saver.flushOnExit();
    expect(h.saved).toEqual(['a']);
    expect(h.exitSaved).toEqual([]);
  });

  it('a reset flush supersedes a pending save', () => {
    const h = harness();
    h.saver.schedule('a');
    h.saver.flush('reset');
    h.fire();
    h.saver.flushOnExit();
    expect(h.saved).toEqual(['reset']);
    expect(h.exitSaved).toEqual([]);
  });

  it('dispose cancels the timer', () => {
    const h = harness();
    h.saver.schedule('a');
    h.saver.dispose();
    expect(h.timers.size).toBe(0);
  });
});
