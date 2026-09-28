import { useMemo } from 'react';
import DOMPurify from 'dompurify';

/**
 * Admin-written rich text (the policy pages), rendered as HTML — but never as
 * script.
 *
 * This content is saved from the Content screen, which staff roles other than
 * the owner can hold, and the storefront keeps its sign-in tokens in
 * localStorage. Rendered raw, one `<img onerror=…>` pasted into a policy page
 * ran in every visitor's browser — including the owner's — and could read
 * those tokens. DOMPurify strips scripts, event handlers and `javascript:`
 * URLs and leaves the formatting alone. The server sanitises on save as well;
 * this covers what was saved before that, and anything that slips past it.
 */
export function SafeHtml({ html, className }: { html: string | null | undefined; className?: string }) {
  const clean = useMemo(() => DOMPurify.sanitize(html ?? ''), [html]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
