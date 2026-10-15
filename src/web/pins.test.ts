import { describe, expect, it } from 'vitest';
import { prunePins } from './pins';

describe('prunePins', () => {
  it('removes unknown ids and returns the same object when unchanged', () => {
    const pinned = { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } };
    expect(prunePins(pinned, new Set(['a', 'b']))).toBe(pinned);
    expect(prunePins(pinned, new Set(['a']))).toEqual({ a: { x: 1, y: 2 } });
    expect(prunePins(pinned, new Set())).toEqual({});
  });
});
