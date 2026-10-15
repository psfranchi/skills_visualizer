import type { Root as HastRoot } from 'hast';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import type { ReactElement } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import rehypeSanitize, { defaultSchema, type Options as SanitizeOptions } from 'rehype-sanitize';
import remarkFrontmatter from 'remark-frontmatter';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { safeHref } from './model';

/** Sanitize schema: no raw HTML; links limited to http(s). */
const sanitizeSchema: SanitizeOptions = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https'],
  },
};

/** Drop or rewrite hrefs that fail `safeHref`; add safe link attrs. */
function rehypeSafeLinks() {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'a') return;
      const href = node.properties?.href;
      if (typeof href !== 'string') {
        if (node.properties) delete node.properties.href;
        return;
      }
      const safe = safeHref(href);
      if (!safe) {
        delete node.properties.href;
        return;
      }
      node.properties.href = safe;
      node.properties.target = '_blank';
      node.properties.rel = ['noopener', 'noreferrer'];
    });
  };
}

/** Parse markdown → sanitized HAST (no `dangerouslySetInnerHTML`). */
export function markdownToHast(markdown: string): HastRoot {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter)
    .use(remarkRehype)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeSafeLinks);
  return processor.runSync(processor.parse(markdown)) as HastRoot;
}

/** Render sanitized markdown to React elements via HAST → JSX runtime. */
export function markdownToReact(markdown: string): ReactElement {
  return toJsxRuntime(markdownToHast(markdown), { Fragment, jsx, jsxs });
}

/** Collect element tag names under a HAST tree (for sanitize tests). */
export function hastTagNames(tree: HastRoot): string[] {
  const tags: string[] = [];
  visit(tree, 'element', (node) => {
    tags.push(node.tagName);
  });
  return tags;
}

/** Collect `a[href]` values after sanitization. */
export function hastHrefs(tree: HastRoot): string[] {
  const hrefs: string[] = [];
  visit(tree, 'element', (node) => {
    if (node.tagName !== 'a') return;
    const href = node.properties?.href;
    if (typeof href === 'string') hrefs.push(href);
  });
  return hrefs;
}
