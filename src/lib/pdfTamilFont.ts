/**
 * The embedded face the documents fall back on for anything Helvetica cannot
 * draw — Tamil on the wholesale invoice, and the rupee sign anywhere.
 *
 * Helvetica — the standard-14 face every other document here relies on — has no
 * Tamil glyphs, and `@react-pdf/renderer` draws a missing glyph as nothing at
 * all with no warning. So those lines need a registered font or they silently
 * vanish from the printed invoice.
 *
 * The rupee sign is the same problem wearing a different hat. U+20B9 is outside
 * WinAnsi, so Helvetica prints it as the byte that survives the encoding — a
 * superscript one, which is why the price list used to read "¹140". This face
 * has the glyph (and Latin, digits, the em dash and the bullet the documents
 * also use), so a list drawn in it can print ₹ properly instead of spelling
 * out "Rs." on every row.
 *
 * The font is fetched here and registered as a data URI rather than handed to
 * the renderer as a path. Registering a URL makes the renderer fetch it *during*
 * the render, where a 404 or a blocked request throws from inside `toBlob()` and
 * takes the entire document down — which reads to the admin as "preview does
 * nothing". Fetching it first turns that into a recoverable condition: the
 * invoice prints in Helvetica and the caller can say why.
 */

const FONT_URL = '/fonts/NotoSansTamil-Regular.ttf';
export const TAMIL_FAMILY = 'NotoTamil';

let state: 'idle' | 'ready' | 'failed' = 'idle';
let inFlight: Promise<boolean> | null = null;

async function register(): Promise<boolean> {
  try {
    const [{ Font }, response] = await Promise.all([
      import('@react-pdf/renderer'),
      fetch(FONT_URL),
    ]);
    if (!response.ok) return false;

    const blob = await response.blob();
    if (!blob.size) return false;

    const dataUri = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    if (!dataUri) return false;

    Font.register({ family: TAMIL_FAMILY, src: dataUri });
    return true;
  } catch {
    return false;
  }
}

/**
 * Load and register the face. Resolves to false when it could not be loaded, so
 * the caller can warn rather than print a document with two blank lines in it.
 * Safe to call repeatedly — the work happens once.
 */
export function prepareTamilFont(): Promise<boolean> {
  if (state === 'ready') return Promise.resolve(true);
  if (state === 'failed') return Promise.resolve(false);
  if (inFlight) return inFlight;

  inFlight = register()
    .then((ok) => {
      state = ok ? 'ready' : 'failed';
      return ok;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * The family to draw Tamil text in, or undefined when the face is unavailable
 * and the caller should fall back to the document's default.
 */
export function tamilFamily(): string | undefined {
  return state === 'ready' ? TAMIL_FAMILY : undefined;
}
