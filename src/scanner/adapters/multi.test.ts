import { describe, expect, it } from 'vitest';
import { SUPPORTED_ADAPTERS } from '../index';
import { ENGINE_ADAPTERS } from './multi';

describe('ENGINE_ADAPTERS', () => {
  it('matches SUPPORTED_ADAPTERS ids in order', () => {
    expect(ENGINE_ADAPTERS.map((a) => a.id)).toEqual([...SUPPORTED_ADAPTERS]);
  });
});
