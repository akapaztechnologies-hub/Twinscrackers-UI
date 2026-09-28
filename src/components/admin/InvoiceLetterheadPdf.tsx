import { View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';

/**
 * Never split a word across lines.
 * react-pdf hyphenates by default, which turned a shop name one point too
 * wide into "SRI GAYAPRIYA FIRE-WORKS FACTORY". The name is sized to fit on
 * one line anyway; this is the backstop for every other line on the sheet.
 * Registered here because both documents that carry this head import it.
 */
Font.registerHyphenationCallback((word) => [word]);
import { pdfImageSrc } from '@/lib/pdfImage.ts';
import { tamilFamily } from '@/lib/pdfTamilFont.ts';
import { DEFAULT_LETTERHEAD, type InvoiceLetterhead } from '@/types/invoiceLetterhead.ts';

/**
 * The shop's printed letterhead, drawn once for every document that carries it.
 *
 * Lifted verbatim out of `WholesaleCaseInvoicePDF` when the regular tax invoice
 * started printing the same head — the styles here are that pad's, unchanged,
 * which is what keeps the two documents identical above the rules. Both now
 * render through this, so there is no second copy to drift.
 *
 * What this does NOT draw is the "No : / Date :" row beneath it: the pad prints
 * its own pad number and invoice date, the tax invoice prints a bill number and
 * a created date, and each owns that row.
 */

/**
 * Tallest an emblem may be. The header band is a fixed share of the page and the
 * shop name, address and the No./Date row all have to fit beside it, so this is
 * the room genuinely left over rather than an arbitrary limit. Carried over from
 * the wholesale pad unchanged — it was tuned against that band.
 */
const EMBLEM_MAX_PT = 78;

/**
 * The shop name is the one line whose length the shop chooses, and it was drawn
 * at a fixed 27pt: "SRI GAYAPRIYA FIREWORKS FACTORY" needs about 537pt in the
 * ~420pt between the emblems, so it printed running off the sheet. It now
 * shrinks until it fits.
 */
const NAME_MAX_PT = 27;
/** Floor for a very long name. Small, but the whole name on one line. */
const NAME_MIN_PT = 9;
/** Fallback only — every caller passes the width it actually has. */
const DEFAULT_CONTENT_W = 551;

/** Width of `text` in em units, before the letter spacing is added on. */
function emWidth(text: string): number {
  let em = 0;
  for (const ch of text) {
    if (ch === ' ') em += 0.28;
    else if (ch >= 'A' && ch <= 'Z') em += 0.74;
    else if (ch >= 'a' && ch <= 'z') em += 0.58;
    else if (ch >= '0' && ch <= '9') em += 0.56;
    else em += 0.5;
  }
  return em;
}

/**
 * The size to print the shop name at — always one line.
 *
 * It shrinks until the whole name fits the space between the emblems. Two
 * lines were tried and rejected: react-pdf hyphenates, so a name that did not
 * fit came out as "SRI GAYAPRIYA FIRE-WORKS FACTORY".
 *
 * Measured per character — capitals run about 30% wider than lower case — and
 * then held to 97% of the space, because this is an estimate and react-pdf
 * cannot measure before layout. Being a point small is invisible; being a
 * point wide breaks the line.
 */
function fitNameSize(name: string, available: number): number {
  const text = name.trim();
  if (!text) return NAME_MAX_PT;
  const em = emWidth(text);
  if (em <= 0) return NAME_MAX_PT;
  const room = available * 0.97 - text.length * 0.6;
  const fitted = room / em;
  // Half-point steps: one more character should not drop two sizes.
  return Math.max(NAME_MIN_PT, Math.min(NAME_MAX_PT, Math.floor(fitted * 2) / 2));
}

function letterheadStyles(ink: string) {
  return StyleSheet.create({
    headerTop: { flexDirection: 'row', alignItems: 'flex-start' },
    // The Tamil invocation is the longest thing in this row and does not wrap,
    // so the centre column gets the width and the sides give it up.
    headerTopSide: { width: '25%' },
    headerTopMid: { width: '50%', alignItems: 'center' },
    metaText: { fontSize: 7.5 },
    metaRight: { fontSize: 7.5, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
    // width:100% matters. Without it the Text shrinks to its own measured
    // width inside the centred column and the last glyph is clipped — the
    // shaped width of Tamil conjuncts is wider than the measurement pass
    // assumes, so the line loses a character on every printed invoice.
    tamilText: { fontSize: 5.9, textAlign: 'center', width: '100%' },

    headerMid: { flexDirection: 'row', alignItems: 'center', flexGrow: 1 },
    // The emblems keep their width; the name column is what gives way.
    emblemSlot: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    // flexShrink matters: react-pdf defaults it to 0, so without it this
    // column grew to whatever the shop name measured and printed the name
    // straight over the right emblem instead of wrapping inside its own space.
    headerCentre: { flexGrow: 1, flexShrink: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
    docTitleBox: { border: `0.9 solid ${ink}`, paddingHorizontal: 8, paddingVertical: 1.5 },
    docTitle: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, letterSpacing: 0.4 },
    // width:100% for the same reason the Tamil line has it — a Text in a
    // centred column sizes to its own content, so without it a long shop name
    // has nothing to wrap against and prints clipped at the frame edge. The
    // size below is fitted to the space; this is the backstop when even the
    // floor is too wide.
    shopName: {
      fontFamily: 'Helvetica-Bold',
      fontSize: NAME_MAX_PT,
      letterSpacing: 0.6,
      marginTop: 1,
      width: '100%',
      textAlign: 'center',
    },
    shopAddress: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, textAlign: 'center' },
    // Reversed out of the ink, as the pad prints it. Hugs its own text rather
    // than spanning the column, so a short line does not become a long bar.
    taglineBand: {
      backgroundColor: ink,
      borderRadius: 2,
      alignSelf: 'center',
      paddingHorizontal: 8,
      paddingVertical: 1.8,
      marginTop: 2.5,
    },
    taglineText: { fontFamily: 'Helvetica-BoldOblique', fontSize: 7.6, color: '#FFFFFF', textAlign: 'center' },
  });
}

/**
 * `titleOverride` lets a document print something other than the saved title
 * without the shop having to keep two letterheads — a quotation says ESTIMATE
 * where the same head would otherwise say TAX INVOICE.
 */
export function InvoiceLetterheadPdf({
  letterhead,
  contentWidth = DEFAULT_CONTENT_W,
  titleOverride,
}: {
  letterhead: InvoiceLetterhead;
  /** Points available between this block's own padding. */
  contentWidth?: number;
  titleOverride?: string;
}) {
  const t = letterhead;
  const s = letterheadStyles(t.inkColor || DEFAULT_LETTERHEAD.inkColor);
  const tamil = tamilFamily();

  // Resolved ahead of the render by preparePdfImages(); undefined means every
  // attempt failed, and the slot lays out empty rather than blocking the
  // document over a decoration.
  const leftEmblem = pdfImageSrc(t.leftEmblemUrl);
  const rightEmblem = pdfImageSrc(t.rightEmblemUrl);

  // Clamped to what the header band can actually hold. The band is a fixed share
  // of the page, so an emblem taller than the space left beside the shop name
  // would push the address lines out of the box rather than just looking big.
  const emblemH = Math.max(24, Math.min(EMBLEM_MAX_PT, t.emblemSize || DEFAULT_LETTERHEAD.emblemSize));
  // Width is the ceiling, not the target: `contain` shrinks to whichever side
  // binds first, so a portrait image stays portrait.
  const emblemStyle = { width: emblemH * 1.3, height: emblemH, objectFit: 'contain' as const };
  const slotStyle = { width: emblemH * 1.3 + 8 };
  // What is left for the name once both emblem slots have taken their width.
  const centreWidth = Math.max(180, contentWidth - 2 * (emblemH * 1.3 + 8) - 8);
  const nameSize = fitNameSize(t.shopName ?? '', centreWidth);

  const title = titleOverride ?? t.docTitle;

  return (
    <>
      <View style={s.headerTop}>
        <View style={s.headerTopSide}>
          {t.headerGstin ? <Text style={s.metaText}>GSTIN No : {t.headerGstin}</Text> : null}
          {t.licenseNo ? <Text style={s.metaText}>License No : {t.licenseNo}</Text> : null}
        </View>
        <View style={s.headerTopMid}>
          {t.tamilLine1 ? (
            <Text style={[s.tamilText, tamil ? { fontFamily: tamil } : {}]}>{t.tamilLine1}</Text>
          ) : null}
          {t.tamilLine2 ? (
            <Text style={[s.tamilText, tamil ? { fontFamily: tamil } : {}]}>{t.tamilLine2}</Text>
          ) : null}
        </View>
        <View style={s.headerTopSide}>
          {t.cellNumber ? <Text style={s.metaRight}>Cell : {t.cellNumber}</Text> : null}
        </View>
      </View>

      <View style={s.headerMid}>
        <View style={[s.emblemSlot, slotStyle]}>
          {leftEmblem ? <Image src={leftEmblem} style={emblemStyle} /> : null}
        </View>
        <View style={[s.headerCentre, { width: centreWidth }]}>
          {title ? (
            <View style={s.docTitleBox}>
              <Text style={s.docTitle}>{title}</Text>
            </View>
          ) : null}
          <Text style={[s.shopName, { fontSize: nameSize }]}>{t.shopName}</Text>
          {t.addressLine1 ? <Text style={s.shopAddress}>{t.addressLine1}</Text> : null}
          {t.addressLine2 ? <Text style={s.shopAddress}>{t.addressLine2}</Text> : null}
          {t.tagline ? (
            <View style={s.taglineBand}>
              <Text style={s.taglineText}>{t.tagline}</Text>
            </View>
          ) : null}
        </View>
        <View style={[s.emblemSlot, slotStyle]}>
          {rightEmblem ? <Image src={rightEmblem} style={emblemStyle} /> : null}
        </View>
      </View>
    </>
  );
}
