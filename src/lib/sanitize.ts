import DOMPurify from 'dompurify';

const SAFE_URL = /^(?:https?:|mailto:|#|\/(?!\/))/i;
const SAFE_IMG = /^(?:https?:|data:image\/(?:png|jpe?g|gif|webp);|blob:)/i;

const SAFE_STYLE_PROPS = new Set(['text-align', 'color', 'background-color', 'margin-left', 'width', 'min-width']);

let hooked = false;
function hook() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? '';
      if (!SAFE_URL.test(href)) node.removeAttribute('href');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
      node.setAttribute('target', '_blank');
    }
    const style = node.getAttribute('style');
    if (style !== null) {
      // Only the declarations the editor itself produces survive.
      const kept = style
        .split(';')
        .map((d) => d.trim())
        .filter((d) => {
          const [prop, ...rest] = d.split(':');
          const value = rest.join(':').trim().toLowerCase();
          return SAFE_STYLE_PROPS.has((prop ?? '').trim().toLowerCase()) && !/url\(|expression|javascript:|@import|\\/.test(value);
        });
      if (kept.length) node.setAttribute('style', kept.join('; '));
      else node.removeAttribute('style');
    }
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src');
      if (src && !SAFE_IMG.test(src)) node.removeAttribute('src');
    }
  });
}

/** Sanitise note HTML. Used on every path that renders or stores note HTML. */
export function sanitizeHtml(html: string): string {
  hook();
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'button', 'textarea', 'select', 'svg', 'math'],
    FORBID_ATTR: ['srcset', 'formaction', 'onerror', 'onload'],
    ALLOW_DATA_ATTR: true,
  });
}

export const isSafeUrl = (u: string) => SAFE_URL.test(u.trim());
