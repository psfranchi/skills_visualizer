import { describe, expect, it } from 'vitest';
import { publicSourceId } from './public-graph';

describe('publicSourceId', () => {
  it('keeps only the folder name of local ids', () => {
    expect(publicSourceId('local:/home/a/projects/repo')).toBe('local:repo');
    expect(publicSourceId('local:C:\\Users\\a\\repo')).toBe('local:repo');
    expect(publicSourceId('local:/')).toBe('local:root');
  });

  it('leaves non-local ids unchanged', () => {
    expect(publicSourceId('memory:fixture/x')).toBe('memory:fixture/x');
  });
});
