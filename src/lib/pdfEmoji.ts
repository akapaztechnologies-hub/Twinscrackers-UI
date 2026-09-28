import { Font } from '@react-pdf/renderer';

/**
 * Let emoji render in the PDFs.
 *
 * `@react-pdf/renderer` draws text with the registered font and nothing else,
 * and the fonts these documents use carry no emoji glyphs — an emoji dropped
 * into a Text node comes out as an empty box or vanishes. Registering an emoji
 * source makes the renderer fetch each one as an image instead.
 *
 * Twemoji is used because it is the set most Indian shops already see in
 * WhatsApp, which is where these documents end up. If the CDN cannot be
 * reached the renderer simply omits the glyph, so every label is written to
 * read on its own with the emoji as decoration rather than meaning.
 */
let registered = false;

export function ensurePdfEmoji(): void {
  if (registered) return;
  registered = true;

  Font.registerEmojiSource({
    format: 'png',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/',
  });
}
