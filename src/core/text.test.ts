import { describe, expect, it } from 'vitest';
import { createSpanLocator, decodeUtf8Strict } from './text';

describe('decodeUtf8Strict', () => {
  it('strips a BOM and reports it', () => {
    const result = decodeUtf8Strict(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]));
    expect(result).toEqual({ ok: true, text: 'hi', bom: true });
  });

  it('rejects invalid UTF-8', () => {
    expect(decodeUtf8Strict(new Uint8Array([0x68, 0xc3, 0x28]))).toEqual({
      ok: false,
      reason: 'invalid-utf8',
    });
  });

  it('treats NUL bytes as binary', () => {
    expect(decodeUtf8Strict(new Uint8Array([0x68, 0x00, 0x69]))).toEqual({
      ok: false,
      reason: 'binary',
    });
  });
});

describe('createSpanLocator', () => {
  it('maps offsets to 1-based line/column with CRLF', () => {
    const locate = createSpanLocator('ab\r\ncd\ne');
    expect(locate(0)).toEqual({ offset: 0, line: 1, column: 1 });
    expect(locate(4)).toEqual({ offset: 4, line: 2, column: 1 });
    expect(locate(5)).toEqual({ offset: 5, line: 2, column: 2 });
    expect(locate(7)).toEqual({ offset: 7, line: 3, column: 1 });
  });
});
