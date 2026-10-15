import { describe, expect, it } from 'vitest';
import { canRichMarkdownPreview, initialDocViewMode, isMarkdownPath } from './doc-view';

describe('isMarkdownPath', () => {
  it('accepts .md and .mdc', () => {
    expect(isMarkdownPath('SKILL.md')).toBe(true);
    expect(isMarkdownPath('.cursor/rules/x.mdc')).toBe(true);
    expect(isMarkdownPath('notes.MD')).toBe(true);
    expect(isMarkdownPath('mcp.json')).toBe(false);
    expect(isMarkdownPath('run.sh')).toBe(false);
  });
});

describe('canRichMarkdownPreview', () => {
  it('requires markdown and non-redacted text', () => {
    expect(canRichMarkdownPreview('SKILL.md', { redacted: false })).toBe(true);
    expect(canRichMarkdownPreview('SKILL.md', { redacted: true })).toBe(false);
    expect(canRichMarkdownPreview('.cursor/mcp.json', { redacted: false })).toBe(false);
  });
});

describe('initialDocViewMode', () => {
  it('defaults to preview when rich preview is allowed', () => {
    expect(initialDocViewMode(true)).toBe('preview');
    expect(initialDocViewMode(false)).toBe('source');
  });
});
