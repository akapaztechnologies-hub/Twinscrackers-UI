import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { buildPdfColors, pdfJoin, lighten } from '@/lib/pdfTheme.ts';
import type { PdfImageSrc } from '@/lib/pdfImage.ts';

/**
 * The shop's price list — the document Sivakasi shops send out on WhatsApp
 * every season, in place of a Word file somebody retypes by hand each year.
 *
 * It is a catalogue, not an invoice, so it does not share BillPDF's layout: no
 * party block, no totals, no signature. What it needs instead is density —
 * two hundred rows have to stay readable across five or six pages, with the
 * category you are looking at named at the top of whichever page you are on.
 *
 * Retail and wholesale are the same document with different columns, because
 * the header, the category bands and the pagination are identical and keeping
 * them together is what stops the two drifting apart.
 */

export type PriceListMode = 'retail' | 'wholesale';
/** none = text only; thumbs = a picture per row; gallery = a photo grid after the tables. */
export type PriceListPhotos = 'none' | 'thumbs' | 'gallery';

export interface PriceListProduct {
  name: string;
  price: number;
  originalPrice?: number;
  wholesalePrice?: number;
  wholesalePricePerCase?: number;
  quantityPerCase?: number;
  /** Already converted to something the renderer can draw; null when it could not be. */
  image?: PdfImageSrc | null;
}

export interface PriceListSection {
  category: string;
  products: PriceListProduct[];
}

export interface PriceListShop {
  name: string;
  tagline?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  gstin?: string;
  /**
   * Where to send the money, straight off Settings -> Payment.
   *
   * A price list is what a dealer is handed before they order, and the first
   * thing they ask after agreeing a rate is where to pay. Shown only when the
   * shop has actually filled these in, so a shop that takes cash at the counter
   * does not publish an empty heading.
   */
  bank?: {
    bankName?: string;
    accountName?: string;
    accountNumber?: string;
    ifsc?: string;
    branch?: string;
    upiId?: string;
  };
  website?: string;
  logo?: PdfImageSrc | null;
  accentColor?: string;
}

export interface PriceListOptions {
  /**
   * The family to draw the document in, when one could be embedded.
   *
   * Set only when the face actually loaded; left undefined
   * the document stays on Helvetica and names the unit as "Rs." instead. Either
   * way the figures print — what it must never do is fall back to Helvetica
   * while still emitting ₹, which is how the list came to read "¹140".
   */
  fontFamily?: string;
  mode: PriceListMode;
  photos: PriceListPhotos;
  /** Headline across the title band, e.g. "RETAIL PRICE LIST 2026". */
  title: string;
  /** Free text under the header — offers, delivery notes, whatever the shop wants. */
  note?: string;
  /** Terms printed once at the very end. */
  terms?: string[];
}

const inr = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

/** Discount off MRP, or null when there is no MRP to discount from. */
function savings(p: PriceListProduct): number | null {
  if (!p.originalPrice || p.originalPrice <= p.price) return null;
  return Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100);
}

/**
 * The headline discount for the title banner.
 *
 * The shop's own sheets lead with one big number, so this takes the most common
 * discount rather than the average — an average of 71% and 81% is 76%, which is
 * a figure no product actually sells at.
 */
function headlineDiscount(sections: PriceListSection[]): number | null {
  const counts = new Map<number, number>();
  for (const section of sections) {
    for (const product of section.products) {
      const pct = savings(product);
      if (pct !== null) counts.set(pct, (counts.get(pct) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

/** Column widths as a share of the row, per mode. They must each total 1. */
function columns(mode: PriceListMode, withThumbs: boolean) {
  const thumb = withThumbs ? 0.07 : 0;
  return mode === 'wholesale'
    ? { thumb, sno: 0.06, name: 0.44 - thumb, a: 0.14, b: 0.16, c: 0.2 }
    : { thumb, sno: 0.06, name: 0.52 - thumb, a: 0.14, b: 0.14, c: 0.14 };
}

export function PriceListPDF({
  sections,
  shop,
  options,
}: {
  sections: PriceListSection[];
  shop: PriceListShop;
  options: PriceListOptions;
}) {
  const c = buildPdfColors(shop.accentColor);
  const wholesale = options.mode === 'wholesale';
  const withThumbs = options.photos === 'thumbs';
  const col = columns(options.mode, withThumbs);
  const discount = wholesale ? null : headlineDiscount(sections);

  const s = StyleSheet.create({
    page: { paddingTop: 22, paddingBottom: 34, paddingHorizontal: 22, fontSize: 9, color: c.text },

    // ─── Masthead (first page only) ───
    head: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.primary, padding: 12, borderRadius: 4 },
    logo: { width: 46, height: 46, objectFit: 'contain', marginRight: 10 },
    shopName: { fontSize: 19, fontWeight: 'bold', color: c.white, letterSpacing: 0.3 },
    tagline: { fontSize: 8.5, color: c.primaryTintStrong, marginTop: 2 },
    contact: { fontSize: 8, color: c.primaryTintSoft, marginTop: 3 },

    titleBand: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
    title: { fontSize: 13, fontWeight: 'bold', color: c.primaryDeep, letterSpacing: 1.2 },
    discountPill: {
      backgroundColor: c.primary,
      color: c.white,
      fontSize: 10,
      fontWeight: 'bold',
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 10,
    },
    note: { marginTop: 5, fontSize: 8.5, color: c.muted, textAlign: 'center' },

    // ─── Running header, every page after the first ───
    runner: {
      position: 'absolute',
      top: 8,
      left: 22,
      right: 22,
      flexDirection: 'row',
      justifyContent: 'space-between',
      fontSize: 7.5,
      color: c.muted,
    },

    // ─── Table ───
    categoryBand: {
      marginTop: 10,
      marginBottom: 2,
      backgroundColor: lighten(c.primary, 0.82),
      borderLeftWidth: 3,
      borderLeftColor: c.primary,
      paddingVertical: 4,
      paddingHorizontal: 6,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    categoryName: { fontSize: 10, fontWeight: 'bold', color: c.primaryDeep, letterSpacing: 0.5 },
    categoryCount: { fontSize: 7.5, color: c.muted },

    headRow: {
      flexDirection: 'row',
      backgroundColor: c.dark,
      paddingVertical: 4,
      paddingHorizontal: 4,
    },
    headCell: { fontSize: 7.5, fontWeight: 'bold', color: c.white, letterSpacing: 0.4 },

    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3.5, paddingHorizontal: 4 },
    rowAlt: { backgroundColor: c.light },
    cell: { fontSize: 8.5 },
    name: { fontSize: 8.5, color: c.dark },
    strike: { fontSize: 8, color: c.muted, textDecoration: 'line-through' },
    rate: { fontSize: 9, fontWeight: 'bold', color: c.primaryDeep },
    save: { fontSize: 8, fontWeight: 'bold', color: '#15803D' },
    thumb: { width: 18, height: 18, objectFit: 'contain' },
    right: { textAlign: 'right' },
    center: { textAlign: 'center' },

    // ─── Gallery ───
    galleryTitle: { fontSize: 12, fontWeight: 'bold', color: c.primaryDeep, marginBottom: 8, letterSpacing: 0.8 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    tile: { width: '25%', padding: 4, alignItems: 'center' },
    tileImg: { width: '100%', height: 72, objectFit: 'contain' },
    tileName: { fontSize: 7, textAlign: 'center', marginTop: 3, color: c.dark },
    tileRate: { fontSize: 8, fontWeight: 'bold', textAlign: 'center', color: c.primaryDeep },

    // ─── Terms + footer ───
    terms: { marginTop: 14, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 6 },
    // Built like the masthead — a solid accent bar over a white card — rather
    // than as a tinted slab. A block of colour this size fights the product
    // table above it, and a washed tint behind bold text reads as muddy.
    bankCard: {
      marginTop: 14,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 4,
      overflow: 'hidden',
    },
    bankBar: { backgroundColor: c.primary, paddingVertical: 5, paddingHorizontal: 9 },
    bankBarText: { fontSize: 9, fontWeight: 'bold', color: c.white, letterSpacing: 1.1 },
    // Three to a row, so six details fill two even rows with no ragged gap.
    bankBody: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: 8, paddingHorizontal: 9 },
    bankCell: { width: '33.33%', paddingRight: 10, marginBottom: 7 },
    bankLabel: { fontSize: 6.5, color: c.muted, letterSpacing: 0.7, marginBottom: 2 },
    bankValue: { fontSize: 9, color: c.dark, fontWeight: 'bold' },
    // The one value a misread costs money on.
    bankAccount: { fontSize: 10.5, color: c.primaryDeep, fontWeight: 'bold', letterSpacing: 0.7 },
    bankFoot: {
      fontSize: 7,
      color: c.muted,
      paddingHorizontal: 9,
      paddingBottom: 7,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 5,
      marginTop: 1,
    },
    termsHead: { fontSize: 8.5, fontWeight: 'bold', color: c.dark, marginBottom: 3 },
    term: { fontSize: 7.5, color: c.muted, marginBottom: 1.5 },
    footer: {
      position: 'absolute',
      bottom: 14,
      left: 22,
      right: 22,
      flexDirection: 'row',
      justifyContent: 'space-between',
      fontSize: 7,
      color: c.muted,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 5,
    },
  });

  const contactLine = pdfJoin([
    shop.phone && `Ph: ${shop.phone}`,
    shop.whatsapp && `WhatsApp: ${shop.whatsapp}`,
    shop.address,
  ]);
  const footerLine = pdfJoin([shop.name, shop.phone, shop.website, shop.gstin && `GSTIN ${shop.gstin}`]);

  /*
   * Only the fields the shop actually filled in.
   *
   * Built as pairs rather than rendered inline so an empty one disappears
   * completely — a price list showing "IFSC:" with nothing after it reads as a
   * mistake in the document rather than a field the shop chose to leave blank.
   */
  /*
   * Ordered so the two rows read across sensibly, and only the fields the shop
   * actually filled. An empty one is dropped entirely rather than printing a
   * heading with nothing under it.
   */
  const bankRows: [string, string, boolean][] = (
    [
      ['BANK', shop.bank?.bankName, false],
      ['BRANCH', shop.bank?.branch, false],
      ['ACCOUNT NAME', shop.bank?.accountName, false],
      ['ACCOUNT NUMBER', shop.bank?.accountNumber, true],
      ['IFSC', shop.bank?.ifsc, false],
      ['UPI', shop.bank?.upiId, false],
    ] as [string, string | undefined, boolean][]
  ).filter((row): row is [string, string, boolean] => Boolean(row[1]?.trim()));

  /**
   * The rupee unit is named once, in the column head.
   *
   * Repeating "Rs." down every row costs three characters of width on each of
   * them, and because the figures are right-aligned and the prefixes are not,
   * the digits stop lining up — a column of prices you cannot scan down is the
   * one thing a price list has to get right.
   */
  /**
   * "MRP (₹)" — with only the rupee sign drawn in the embedded face.
   *
   * The whole document cannot switch to that face: it ships a single weight,
   * and this layout is built on bold column heads, bold rates and a bold
   * masthead, all of which would quietly flatten to regular. Nesting one glyph
   * keeps Helvetica's bold everywhere and still prints a real ₹.
   *
   * With no face embedded the unit is spelled out instead — never a bare ₹ in
   * Helvetica, which is what printed "¹140".
   */
  const unitHead = (label: string) =>
    options.fontFamily ? (
      <>
        {label} (<Text style={{ fontFamily: options.fontFamily }}>₹</Text>)
      </>
    ) : (
      `${label} (Rs.)`
    );

  const headings = wholesale
    ? ['#', 'Product', 'Pcs / Case', unitHead('Rate / Pc'), unitHead('Rate / Case')]
    : ['#', 'Product', unitHead('MRP'), unitHead('Our Rate'), 'You Save'];

  const galleryProducts =
    options.photos === 'gallery'
      ? sections.flatMap((section) => section.products).filter((p) => p.image)
      : [];

  /**
   * Numbering runs across the whole list, not per category, so a customer can
   * quote "number 84" over the phone without naming the section too. Assigned
   * before the render rather than counted during it.
   */
  const numbered = sections.reduce<{ sections: (PriceListSection & { first: number })[]; next: number }>(
    (acc, section) => {
      acc.sections.push({ ...section, first: acc.next });
      return { sections: acc.sections, next: acc.next + section.products.length };
    },
    { sections: [], next: 1 },
  ).sections;

  return (
    <Document title={options.title} author={shop.name}>
      <Page size="A4" style={s.page} wrap>
        {/* Only from page 2 — page 1 carries the full masthead instead. */}
        <View
          style={s.runner}
          fixed
          render={({ pageNumber }) =>
            pageNumber > 1 ? (
              <>
                <Text>{shop.name}</Text>
                <Text>{options.title}</Text>
              </>
            ) : null
          }
        />

        <View style={s.head}>
          {shop.logo ? <Image style={s.logo} src={shop.logo} /> : null}
          <View>
            <Text style={s.shopName}>{shop.name}</Text>
            {shop.tagline ? <Text style={s.tagline}>{shop.tagline}</Text> : null}
            {contactLine ? <Text style={s.contact}>{contactLine}</Text> : null}
          </View>
        </View>

        <View style={s.titleBand}>
          <Text style={s.title}>{options.title}</Text>
          {discount !== null ? <Text style={s.discountPill}>{discount}% OFF</Text> : null}
        </View>
        {options.note ? <Text style={s.note}>{options.note}</Text> : null}

        {numbered.map((section) => (
          <View key={section.category}>
            {/* Keeps a band from stranding itself at the foot of a page. */}
            <View style={s.categoryBand} minPresenceAhead={60}>
              <Text style={s.categoryName}>{section.category.toUpperCase()}</Text>
              <Text style={s.categoryCount}>
                {section.products.length} item{section.products.length === 1 ? '' : 's'}
              </Text>
            </View>

            <View style={s.headRow} fixed={false}>
              {withThumbs ? <View style={{ width: `${col.thumb * 100}%` }} /> : null}
              <Text style={[s.headCell, { width: `${col.sno * 100}%` }]}>{headings[0]}</Text>
              <Text style={[s.headCell, { width: `${col.name * 100}%` }]}>{headings[1]}</Text>
              <Text style={[s.headCell, s.right, { width: `${col.a * 100}%` }]}>{headings[2]}</Text>
              <Text style={[s.headCell, s.right, { width: `${col.b * 100}%` }]}>{headings[3]}</Text>
              <Text style={[s.headCell, s.right, { width: `${col.c * 100}%` }]}>{headings[4]}</Text>
            </View>

            {section.products.map((product, i) => {
              const pct = savings(product);
              return (
                <View key={`${section.category}-${product.name}-${i}`} style={[s.row, ...(i % 2 ? [s.rowAlt] : [])]} wrap={false}>
                  {withThumbs ? (
                    <View style={{ width: `${col.thumb * 100}%` }}>
                      {product.image ? <Image style={s.thumb} src={product.image} /> : null}
                    </View>
                  ) : null}
                  <Text style={[s.cell, { width: `${col.sno * 100}%`, color: c.muted }]}>{section.first + i}</Text>
                  <Text style={[s.name, { width: `${col.name * 100}%` }]}>{product.name}</Text>

                  {wholesale ? (
                    <>
                      <Text style={[s.cell, s.right, { width: `${col.a * 100}%` }]}>
                        {product.quantityPerCase ? inr(product.quantityPerCase) : '—'}
                      </Text>
                      <Text style={[s.cell, s.right, { width: `${col.b * 100}%` }]}>
                        {product.wholesalePrice ? inr(product.wholesalePrice) : '—'}
                      </Text>
                      <Text style={[s.rate, s.right, { width: `${col.c * 100}%` }]}>
                        {product.wholesalePricePerCase ? inr(product.wholesalePricePerCase) : '—'}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={[s.strike, s.right, { width: `${col.a * 100}%` }]}>
                        {product.originalPrice ? inr(product.originalPrice) : ''}
                      </Text>
                      <Text style={[s.rate, s.right, { width: `${col.b * 100}%` }]}>{inr(product.price)}</Text>
                      <Text style={[s.save, s.right, { width: `${col.c * 100}%` }]}>
                        {pct !== null ? `${pct}%` : ''}
                      </Text>
                    </>
                  )}
                </View>
              );
            })}
          </View>
        ))}

        {options.terms?.length ? (
          <View style={s.terms} wrap={false}>
            <Text style={s.termsHead}>Terms</Text>
            {options.terms.map((term, i) => (
              <Text key={i} style={s.term}>
                • {term}
              </Text>
            ))}
          </View>
        ) : null}

        {/* Kept together on one page: an account number split across a page
            break is how money reaches the wrong account. */}
        {bankRows.length > 0 ? (
          <View style={s.bankCard} wrap={false}>
            <View style={s.bankBar}>
              <Text style={s.bankBarText}>BANK DETAILS</Text>
            </View>

            <View style={s.bankBody}>
              {bankRows.map(([label, value, emphasis]) => (
                <View key={label} style={s.bankCell}>
                  <Text style={s.bankLabel}>{label}</Text>
                  <Text style={emphasis ? s.bankAccount : s.bankValue}>{value}</Text>
                </View>
              ))}
            </View>

            <Text style={s.bankFoot}>
              Please send the payment screenshot after transferring.
            </Text>
          </View>
        ) : null}

        <View style={s.footer} fixed>
          <Text>{footerLine}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>

      {galleryProducts.length > 0 && (
        <Page size="A4" style={s.page} wrap>
          <Text style={s.galleryTitle}>PHOTO GALLERY</Text>
          <View style={s.grid}>
            {galleryProducts.map((product, i) => (
              <View key={`tile-${i}`} style={s.tile} wrap={false}>
                <Image style={s.tileImg} src={product.image as PdfImageSrc} />
                <Text style={s.tileName}>{product.name}</Text>
                <Text style={s.tileRate}>
                  {options.fontFamily ? (
                    <Text style={{ fontFamily: options.fontFamily }}>₹</Text>
                  ) : (
                    'Rs. '
                  )}
                  {inr(wholesale ? product.wholesalePricePerCase ?? product.price : product.price)}
                </Text>
              </View>
            ))}
          </View>

          <View style={s.footer} fixed>
            <Text>{footerLine}</Text>
            <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
        </Page>
      )}
    </Document>
  );
}
