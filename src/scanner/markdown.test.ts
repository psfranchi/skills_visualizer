import { describe, expect, it } from 'vitest';
import { parseLenientFrontmatter, parseMarkdown } from './markdown';

describe('parseMarkdown', () => {
  it('extracts links, images, definitions, and inline code with absolute offsets', () => {
    const text = [
      '---',
      'name: x',
      '---',
      '',
      'See [docs](docs/a.md#part) and ![img](img/p.png).',
      'Ref [r][1] and `scripts/run.sh` plus `not a path`.',
      '',
      '[1]: ./ref.md',
      '',
      '```',
      '[ignored](inside/code.md)',
      '```',
    ].join('\n');
    const doc = parseMarkdown(text);
    expect(doc.frontmatter).toMatchObject({ status: 'ok', data: { name: 'x' } });
    expect(doc.links.map((l) => [l.kind, l.url])).toEqual([
      ['link', 'docs/a.md#part'],
      ['image', 'img/p.png'],
      ['definition', './ref.md'],
    ]);
    for (const link of doc.links) expect(text.slice(link.start, link.end)).toContain(link.url);
    expect(doc.inlineCode.map((c) => c.value)).toEqual(['scripts/run.sh', 'not a path']);
    const [code] = doc.inlineCode;
    expect(code && text.slice(code.start, code.end)).toBe('`scripts/run.sh`');
  });

  it('reports invalid YAML with an absolute offset', () => {
    const text = '---\nname: ok\ndescription: [unclosed\n---\n# Body\n';
    const doc = parseMarkdown(text);
    expect(doc.frontmatter.status).toBe('invalid');
    if (doc.frontmatter.status !== 'invalid') return;
    expect(doc.frontmatter.errorOffset).toBeGreaterThanOrEqual(text.indexOf('description'));
    expect(doc.frontmatter.errorOffset).toBeLessThan(text.indexOf('# Body'));
  });

  it('parses CRLF frontmatter', () => {
    const doc = parseMarkdown('---\r\nname: crlf\r\ndescription: d\r\n---\r\n\r\n# T\r\n');
    expect(doc.frontmatter).toMatchObject({
      status: 'ok',
      data: { name: 'crlf', description: 'd' },
    });
  });

  it('returns none without frontmatter', () => {
    expect(parseMarkdown('# Title\n').frontmatter).toEqual({ status: 'none' });
  });
});

describe('parseLenientFrontmatter', () => {
  it('reads key: value lines when YAML would fail (unquoted globs)', () => {
    const text = '---\ndescription:\nglobs: *.ts, *.tsx\nalwaysApply: false\n---\n';
    const doc = parseMarkdown(text);
    expect(doc.frontmatter.status).toBe('invalid');
    if (doc.frontmatter.status !== 'invalid') return;
    expect(parseLenientFrontmatter(text, doc.frontmatter.range)).toEqual({
      description: null,
      globs: '*.ts, *.tsx',
      alwaysApply: false,
    });
  });

  it('trims values and parses a long whitespace run before \\r in linear time', () => {
    const line = `k: x${' '.repeat(100_000)}\ry`;
    const text = `---\nglobs: *.ts\n${line}\nname:  padded  \n---\n`;
    const doc = parseMarkdown(text);
    if (doc.frontmatter.status !== 'invalid') throw new Error('expected lenient fallback');
    const started = performance.now();
    const data = parseLenientFrontmatter(text, doc.frontmatter.range);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(data.name).toBe('padded');
    expect(data.k).toBe(`x${' '.repeat(100_000)}\ry`.trim());
  });
});
