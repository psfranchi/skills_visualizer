import type { Span } from './schema';

export type DecodeResult =
  | { ok: true; text: string; bom: boolean }
  | { ok: false; reason: 'binary' | 'invalid-utf8' };

const BINARY_SNIFF_BYTES = 8000;

/**
 * Strict UTF-8 decode. A NUL byte in the first 8000 bytes means binary.
 * A leading BOM is stripped; all offsets in the graph index into the returned `text`.
 */
export function decodeUtf8Strict(bytes: Uint8Array): DecodeResult {
  if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return { ok: false, reason: 'binary' };
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { ok: true, text, bom };
  } catch {
    return { ok: false, reason: 'invalid-utf8' };
  }
}

/** Maps UTF-16 offsets in `text` to 1-based line/column spans. */
export function createSpanLocator(text: string): (offset: number) => Span {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0x0a) lineStarts.push(i + 1);
  }
  return (offset) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((lineStarts[mid] ?? 0) <= offset) low = mid;
      else high = mid - 1;
    }
    return { offset, line: low + 1, column: offset - (lineStarts[low] ?? 0) + 1 };
  };
}
