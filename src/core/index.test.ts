import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from './index';

describe('core', () => {
  it('exposes graph schema version 1', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});
