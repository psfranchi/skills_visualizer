import { describe, expect, it } from 'vitest';
import { shouldPin } from './graph-render';

describe('shouldPin', () => {
  it('treats click jitter as a click', () => {
    expect(shouldPin(0, 0)).toBe(false);
    expect(shouldPin(3, 0)).toBe(false);
    expect(shouldPin(2, 2)).toBe(false);
  });

  it('pins once the total displacement reaches the click distance', () => {
    expect(shouldPin(4, 0)).toBe(true);
    expect(shouldPin(-3, -3)).toBe(true);
  });

  it('does not pin a drag that returns to its start', () => {
    expect(shouldPin(10 - 10, -5 + 5)).toBe(false);
  });
});
