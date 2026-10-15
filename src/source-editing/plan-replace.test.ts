import { describe, expect, it } from 'vitest';
import { decodeUtf8Strict, sha256Hex } from '../core';
import { applyEol, detectEol, planReplace } from './plan-replace';

const enc = new TextEncoder();

function bytes(...parts: (string | Uint8Array)[]): Uint8Array {
  const chunks = parts.map((p) => (typeof p === 'string' ? enc.encode(p) : p));
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

const BOM = new Uint8Array([0xef, 0xbb, 0xbf]);

describe('detectEol / applyEol', () => {
  it('detects CRLF when present, otherwise LF', () => {
    expect(detectEol('a\r\nb')).toBe('crlf');
    expect(detectEol('a\nb')).toBe('lf');
    expect(detectEol('a')).toBe('lf');
  });

  it('normalizes mixed endings to the target EOL', () => {
    expect(applyEol('a\r\nb\nc', 'lf')).toBe('a\nb\nc');
    expect(applyEol('a\nb\nc', 'crlf')).toBe('a\r\nb\r\nc');
  });
});

describe('planReplace', () => {
  const skill = [
    '---',
    'name: demo',
    'description: Keep this.',
    'license: MIT',
    'unknown-field: stays',
    '# comment in yaml is preserved by round-trip of raw text',
    '---',
    '',
    '# Demo',
    '',
    'Body stays.',
    '',
  ].join('\n');

  it('preserves LF, key order, unknown fields, comments, and untouched regions', () => {
    const original = enc.encode(skill);
    // Textarea edits only the description line; the rest is typed back unchanged.
    const edited = skill.replace('description: Keep this.', 'description: Changed.');
    const plan = planReplace(original, edited);
    expect(plan.eol).toBe('lf');
    expect(plan.bom).toBe(false);
    expect(plan.bytes).toEqual(enc.encode(edited));
    expect(new TextDecoder().decode(plan.bytes)).toContain('unknown-field: stays');
    expect(new TextDecoder().decode(plan.bytes)).toContain('# comment in yaml');
    expect(new TextDecoder().decode(plan.bytes)).toContain('Body stays.');
  });

  it('restores CRLF and BOM and keeps no trailing newline', async () => {
    const crlf = '---\r\nname: demo\r\ndescription: x\r\n---\r\n# Body';
    const original = bytes(BOM, crlf);
    const plan = planReplace(original, '---\nname: demo\ndescription: y\n---\n# Body');
    expect(plan.eol).toBe('crlf');
    expect(plan.bom).toBe(true);
    expect(plan.bytes.slice(0, 3)).toEqual(BOM);
    expect(plan.bytes.at(-1)).toBe('y'.charCodeAt(0)); // no trailing newline
    const decoded = decodeUtf8Strict(plan.bytes);
    expect(decoded.ok && decoded.text).toBe('---\r\nname: demo\r\ndescription: y\r\n---\r\n# Body');
    // Untouched "# Body" region is byte-identical after the changed description.
    const afterDesc = enc.encode('\r\n---\r\n# Body');
    expect(plan.bytes.slice(plan.bytes.length - afterDesc.length)).toEqual(afterDesc);
    expect(await sha256Hex(plan.bytes)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('preserves Unicode unchanged', () => {
    const text = '---\nname: demo\ndescription: café 日本語 🎉\n---\n';
    const plan = planReplace(enc.encode(text), text.replace('café', 'café!'));
    expect(new TextDecoder().decode(plan.bytes)).toContain('café! 日本語 🎉');
  });

  it('rejects binary originals', () => {
    expect(() => planReplace(new Uint8Array([0, 1, 2]), 'x')).toThrow(/binary/);
  });
});
