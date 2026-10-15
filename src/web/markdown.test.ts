import { describe, expect, it } from 'vitest';
import { hastHrefs, hastImgSrcs, hastTagNames, markdownToHast } from './markdown';

describe('markdownToHast sanitization', () => {
  it('strips script elements from raw HTML in markdown', () => {
    const tree = markdownToHast('Hello <script>alert(1)</script> world');
    expect(hastTagNames(tree)).not.toContain('script');
  });

  it('strips javascript: links and keeps http(s)', () => {
    const tree = markdownToHast(
      '[bad](javascript:alert(1)) [ok](https://example.com/a) [also](http://localhost/x)',
    );
    const hrefs = hastHrefs(tree);
    expect(hrefs).toEqual(['https://example.com/a', 'http://localhost/x']);
    expect(hrefs.some((h) => /javascript:/i.test(h))).toBe(false);
  });

  it('drops data: and other non-http schemes', () => {
    const tree = markdownToHast('[x](data:text/html,hi) [y](vbscript:msg)');
    expect(hastHrefs(tree)).toEqual([]);
  });

  it('strips javascript: and data: image sources', () => {
    const tree = markdownToHast(
      '<img src="javascript:alert(1)" alt="x" /> <img src="data:image/png;base64,xx" alt="y" /> ![z](https://example.com/z.png)',
    );
    expect(hastImgSrcs(tree)).toEqual(['https://example.com/z.png']);
  });

  it('removes iframe elements', () => {
    const tree = markdownToHast('<iframe src="https://evil.example"></iframe>\n\nSafe');
    expect(hastTagNames(tree)).not.toContain('iframe');
  });
});
