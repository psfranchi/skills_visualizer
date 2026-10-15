import { decodeUtf8Strict } from '../core';

export type Eol = 'lf' | 'crlf';

export interface PlannedReplace {
  bytes: Uint8Array;
  eol: Eol;
  bom: boolean;
  /** Decoded text of `bytes` (BOM stripped); used for diffs and adapter reparse. */
  text: string;
}

const BOM = new Uint8Array([0xef, 0xbb, 0xbf]);

/** Detect CRLF when the original contains at least one `\r\n`; otherwise LF. */
export function detectEol(text: string): Eol {
  return text.includes('\r\n') ? 'crlf' : 'lf';
}

/** Normalize textarea LF text to the target EOL, without a BOM. */
export function applyEol(text: string, eol: Eol): string {
  const lf = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return eol === 'crlf' ? lf.replace(/\n/g, '\r\n') : lf;
}

/**
 * Rebuild file bytes from textarea text, restoring the original EOL style and BOM.
 * Textareas normalize to LF; callers must pass that LF text as `newText`.
 */
export function planReplace(original: Uint8Array, newText: string): PlannedReplace {
  const decoded = decodeUtf8Strict(original);
  if (!decoded.ok) {
    throw new Error(
      decoded.reason === 'binary' ? 'File looks binary.' : 'File is not valid UTF-8.',
    );
  }
  const eol = detectEol(decoded.text);
  const withEol = applyEol(newText, eol);
  const body = new TextEncoder().encode(withEol);
  const bytes = decoded.bom
    ? (() => {
        const out = new Uint8Array(BOM.length + body.length);
        out.set(BOM);
        out.set(body, BOM.length);
        return out;
      })()
    : body;
  return { bytes, eol, bom: decoded.bom, text: withEol };
}
