import { markdownToReact } from './markdown';

interface MarkdownPreviewProps {
  markdown: string;
  className?: string;
}

/** Sanitized markdown → React (HAST → JSX). Never uses unsanitized HTML. */
export function MarkdownPreview({ markdown, className }: MarkdownPreviewProps) {
  return (
    <div className={className ? `md-preview ${className}` : 'md-preview'}>
      {markdownToReact(markdown)}
    </div>
  );
}
