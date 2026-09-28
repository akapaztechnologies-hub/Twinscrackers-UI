import type { ReactNode } from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { numberToWords } from '@/lib/numberToWords.ts';
import { draftFigures, isPricedLine, type CaseDraft } from '@/lib/caseInvoiceDraft.ts';
import { InvoiceLetterheadPdf } from '@/components/admin/InvoiceLetterheadPdf.tsx';
import { DEFAULT_WHOLESALE_TEMPLATE, type WholesaleInvoiceTemplate } from '@/types/wholesaleInvoice.ts';

/**
 * The wholesale full-case invoice — a reproduction of the shop's printed bill
 * book, rather than a variant of the tax invoice in BillPDF.tsx.
 *
 * It is a separate component on purpose. BillPDF is a modern flowing document:
 * a coloured header band, cards, a table that grows with the item count. This
 * one is a ruled ledger with a fixed number of rows that must look identical
 * whether it carries two lines or twelve, because it is meant to be
 * indistinguishable from the pad it replaces. Expressing both in one component
 * would make each of them worse.
 *
 * Per-piece wholesale billing deliberately keeps using BillPDF. Only full-case
 * billing renders through here.
 */

// ─── Geometry ───
//
// Every band is a share of the page so the grid lands in the same place whatever
// row count the admin configured, and the ruled rows absorb what is left over —
// the sheet is always exactly full.

const PAGE_H = 841.89; // A4 portrait, in points
const PAGE_W = 595.28;
const MARGIN = 16;
const FRAME_H = PAGE_H - MARGIN * 2;
const FRAME_W = PAGE_W - MARGIN * 2;

const BAND = {
  header: FRAME_H * 0.153,
  party: FRAME_H * 0.151,
  tableHead: FRAME_H * 0.038,
  hsn: FRAME_H * 0.027,
  totals: FRAME_H * 0.155,
  sign: FRAME_H * 0.084,
};

const ROWS_H = FRAME_H - Object.values(BAND).reduce((a, b) => a + b, 0);

/**
 * The shortest ruled row that still holds a line of 8.5pt text.
 *
 * Squeezing every line onto one sheet used to shrink a forty-line order to rows
 * shorter than the type in them. Past this, the invoice continues on a second
 * sheet instead.
 */
const MIN_ROW_H = 14;

/** Column widths as a share of the frame, measured off the reference pad. */
const COL = {
  sno: 0.09,
  particulars: 0.49,
  qty: 0.09,
  rate: 0.14,
  rupees: 0.13,
  paise: 0.06,
};

/**
 * The same grid with the pad's "No. of Cases" column in front.
 *
 * Only the factory's bills fill that column, so the shop's own invoice keeps
 * the layout above untouched. The width comes out of PARTICULARS, which has the
 * most to give.
 */
const COL_WITH_CASES = {
  cases: 0.12,
  sno: 0.07,
  particulars: 0.39,
  qty: 0.09,
  rate: 0.14,
  rupees: 0.13,
  paise: 0.06,
};

function fmtDate(value: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Break the amount in words across the pad's three leader lines.
 *
 * Split on whole words at a character budget rather than left to wrap: a
 * `Text` that wraps inside a bordered box draws its rule under the first line
 * only, so the second and third leaders would disappear exactly when a long
 * figure needs them.
 */
function wrapWords(text: string, lines: number, perLine: number): string[] {
  const out: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    if (current && `${current} ${word}`.length > perLine && out.length < lines - 1) {
      out.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  out.push(current);
  while (out.length < lines) out.push('');
  return out.slice(0, lines);
}

/** The Amount column is split Rs. | Ps. on the pad, so every figure is halved. */
function splitAmount(n: number): { rupees: string; paise: string } {
  const safe = Number.isFinite(n) ? n : 0;
  const whole = Math.floor(Math.abs(safe));
  const paise = Math.round((Math.abs(safe) - whole) * 100);
  return {
    rupees: `${safe < 0 ? '-' : ''}${whole.toLocaleString('en-IN')}`,
    paise: String(paise).padStart(2, '0'),
  };
}

function makeStyles(ink: string) {
  const rule = `0.7 solid ${ink}`;
  return StyleSheet.create({
    page: { fontFamily: 'Helvetica', color: ink, paddingTop: MARGIN, paddingHorizontal: MARGIN },
    // The pad's double rule: an outer box with a second, inset box inside it.
    frameOuter: { width: FRAME_W, height: FRAME_H, border: `1.6 solid ${ink}`, padding: 1.8 },
    frameInner: { flexGrow: 1, border: `0.7 solid ${ink}`, flexDirection: 'column' },

    // ── Header ──
    header: { height: BAND.header, paddingHorizontal: 6, paddingTop: 4, borderBottom: rule },
    // The letterhead's own styles live with it in InvoiceLetterheadPdf, which
    // draws everything between the top of the band and this row.
    headerBottom: { flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 2 },
    noLabel: { fontSize: 9 },
    noValue: { fontFamily: 'Helvetica-Bold', fontSize: 13, marginLeft: 8 },

    // ── Party block ──
    party: {
      height: BAND.party,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderBottom: rule,
      // Spread the leaders down the band rather than stacking them at the top —
      // the pad's rules are evenly spaced, and a fixed margin leaves dead space
      // under the last one whenever the band height is tuned.
      justifyContent: 'space-between',
    },
    partyRow: { flexDirection: 'row', alignItems: 'flex-end' },
    partyLabel: { fontSize: 8.5, width: 62 },
    // A dotted rule the value sits on, so a blank field still prints its leader.
    partyValue: {
      flexGrow: 1,
      fontSize: 8.5,
      paddingLeft: 3,
      paddingBottom: 1.5,
      borderBottom: `0.7 dotted ${ink}`,
    },

    // ── Grid ──
    row: { flexDirection: 'row', borderBottom: rule },
    headRow: { flexDirection: 'row', height: BAND.tableHead, borderBottom: rule },
    cell: { justifyContent: 'center', paddingHorizontal: 3, borderRight: rule },
    cellLast: { justifyContent: 'center', paddingHorizontal: 3 },
    headText: { fontFamily: 'Helvetica-Bold', fontSize: 8, textAlign: 'center' },
    headTextSmall: { fontFamily: 'Helvetica-Bold', fontSize: 7, textAlign: 'center' },
    bodyText: { fontSize: 8.5 },
    bodyNum: { fontSize: 8.5, textAlign: 'right' },
    bodyCentre: { fontSize: 8.5, textAlign: 'center' },

    // ── HSN strip ──
    hsnRow: { flexDirection: 'row', height: BAND.hsn, borderBottom: rule },
    hsnPill: {
      borderRadius: 7,
      border: `0.8 solid ${ink}`,
      paddingHorizontal: 6,
      paddingVertical: 1.5,
      alignSelf: 'center',
      marginLeft: 4,
      flexDirection: 'row',
    },
    hsnLabel: { fontSize: 7.5 },
    hsnValue: { fontFamily: 'Helvetica-Bold', fontSize: 7.5 },

    // ── Totals ──
    totals: { flexDirection: 'row', height: BAND.totals, borderBottom: rule },
    wordsPane: { flexGrow: 1, paddingHorizontal: 8, paddingTop: 7, borderRight: rule },
    wordsRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 9 },
    wordsLabel: { fontSize: 9 },
    wordsLine: {
      flexGrow: 1,
      fontSize: 8.5,
      paddingLeft: 4,
      paddingBottom: 1.5,
      borderBottom: `0.7 dotted ${ink}`,
    },
    eoe: { fontSize: 8.5, marginTop: 'auto', marginBottom: 4 },

    totalsLabelCol: { width: FRAME_W * 0.155, borderRight: rule },
    totalsValueCol: { width: FRAME_W * 0.19 },
    totalsCell: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 5, borderBottom: rule },
    totalsCellLast: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 5 },
    totalsLabel: { fontSize: 8.5, textAlign: 'right' },
    totalsLabelBold: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, textAlign: 'right' },
    totalsValue: { fontSize: 8.5, textAlign: 'right' },
    totalsValueBold: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, textAlign: 'right' },

    // ── Terms & signature ──
    sign: { height: BAND.sign, flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 4 },
    // The conditions take whatever width is left; the signature keeps its own,
    // so a long jurisdiction line can never push "For <shop>" off the sheet.
    signTerms: { flexGrow: 1, flexShrink: 1, minWidth: 0, paddingRight: 10 },
    termsText: { fontSize: 6.6, lineHeight: 1.3 },
    signedByRow: { flexDirection: 'row', marginTop: 'auto' },
    signedBy: { fontSize: 8, width: 96 },
    signFor: { alignItems: 'flex-end', flexShrink: 0 },
    forLabel: { fontSize: 9 },
    forName: { fontFamily: 'Helvetica-Bold', fontSize: 11 },
    signatory: { fontSize: 8.5, marginTop: 'auto' },
  });
}

export interface WholesaleCaseInvoiceProps {
  draft: CaseDraft;
  template?: Partial<WholesaleInvoiceTemplate>;
}

export function WholesaleCaseInvoicePDF({ draft, template }: WholesaleCaseInvoiceProps) {
  // Resolved by prepareTamilFont() before the render starts. Undefined means the
  // face could not be loaded, and the lines fall back to the page font rather
  // than naming a family the renderer has never heard of.
  const t: WholesaleInvoiceTemplate = { ...DEFAULT_WHOLESALE_TEMPLATE, ...template };
  const ink = t.inkColor || DEFAULT_WHOLESALE_TEMPLATE.inkColor;
  const rule = `0.7 solid ${ink}`;
  const s = makeStyles(ink);

  // The lines the server prices, and the figures it stored for them — or, in
  // the editor, the same function run over the draft. This used to re-price
  // every bill as percent GST with no coupon and a derived round-off, so the
  // printed grand total disagreed with the saved one.
  const lines = draft.lines.filter(isPricedLine);
  const f = draftFigures(draft);

  // Rows on a sheet: the template's count, stretched to fit a slightly longer
  // order, but never below a row that holds its text. A longer order continues
  // on the next sheet with the totals on the last.
  const templateRows = t.rowCount || DEFAULT_WHOLESALE_TEMPLATE.rowCount;
  const maxRows = Math.max(templateRows, Math.floor(ROWS_H / MIN_ROW_H));
  const rowsPerPage = Math.max(templateRows, Math.min(lines.length, maxRows));
  const pageCount = Math.max(1, Math.ceil(lines.length / rowsPerPage));
  const rowHeight = ROWS_H / rowsPerPage;

  // A flat GST has no true rate to print — `gstRate` is then only a derived
  // two-decimal figure — so the rows carry the amounts alone, as the tax
  // invoice already does.
  const flat = draft.gstMode === 'flat';
  const halfRate = draft.gstRate / 2;

  // One condition per line, blank lines dropped: an admin who leaves a
  // trailing newline in the box should not print an empty rule on the pad.
  const termsLines = (t.terms ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const amountWords = wrapWords(numberToWords(f.grandTotal).replace(/ Only$/, ''), 3, 62);
  // IGST prints whenever there is IGST to print. Hiding the row on an
  // inter-state invoice left its tax out of the column entirely.
  const showIgst = t.showIgstRow || draft.taxKind === 'inter';

  const w = (share: number) => FRAME_W * share;

  // A bill that numbers its cases gets the extra column; one that does not is
  // laid out exactly as before.
  const showCases = draft.lines.some((l) => (l.caseLabel ?? '').trim() !== '');
  const col = showCases ? COL_WITH_CASES : COL;

  const cell = (key: string, share: number, content: ReactNode, last = false) => (
    <View key={key} style={[last ? s.cellLast : s.cell, { width: w(share) }]}>
      {content}
    </View>
  );

  /**
   * The totals stack, top to bottom. Packaging and delivery are in the grand
   * total, so they get a row whenever they are charged — without one the
   * column did not add up to the figure at its foot.
   */
  const totalRows: { label: string; value: string; bold?: boolean }[] = [
    { label: 'Total', value: f.taxableAmount.toFixed(2) },
    {
      label: `CGST ${draft.taxKind === 'intra' && !flat ? `${halfRate}%` : flat ? '' : '%'}`,
      value: f.totalCgst ? f.totalCgst.toFixed(2) : '',
    },
    {
      label: `SGST ${draft.taxKind === 'intra' && !flat ? `${halfRate}%` : flat ? '' : '%'}`,
      value: f.totalSgst ? f.totalSgst.toFixed(2) : '',
    },
    ...(showIgst
      ? [
          {
            label: `IGST ${draft.taxKind === 'inter' && !flat ? `${draft.gstRate}%` : flat ? '' : '%'}`,
            value: f.totalIgst ? f.totalIgst.toFixed(2) : '',
          },
        ]
      : []),
    ...(f.packagingFee > 0 ? [{ label: 'Packing', value: f.packagingFee.toFixed(2) }] : []),
    ...(f.deliveryCharge > 0 ? [{ label: 'Delivery', value: f.deliveryCharge.toFixed(2) }] : []),
    { label: 'Round Off', value: f.roundOff ? f.roundOff.toFixed(2) : '' },
    { label: 'Grand Total', value: f.grandTotal.toFixed(2), bold: true },
  ];

  return (
    <Document>
      {Array.from({ length: pageCount }).map((_, pageIndex) => {
        const first = pageIndex * rowsPerPage;
        const isLast = pageIndex === pageCount - 1;
        return (
          <Page key={`p${pageIndex}`} size="A4" style={s.page}>
            <View style={s.frameOuter}>
              <View style={s.frameInner}>

                {/* ═══ HEADER ═══ */}
                <View style={s.header}>
                  {/* The shop's letterhead, shared verbatim with the regular tax
                      invoice so both documents print the same head. */}
                  <InvoiceLetterheadPdf letterhead={t} contentWidth={FRAME_W - 12} />

                  <View style={s.headerBottom}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', width: '50%' }}>
                      <Text style={s.noLabel}>No :</Text>
                      <Text style={s.noValue}>{draft.displayNumber}</Text>
                    </View>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-end',
                        width: '50%',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <Text style={s.noLabel}>Date : </Text>
                      <Text style={[s.noLabel, { fontFamily: 'Helvetica-Bold', minWidth: 96 }]}>
                        {fmtDate(draft.invoiceDate)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* ═══ PARTY ═══ */}
                <View style={s.party}>
                  <View style={s.partyRow}>
                    <Text style={s.partyLabel}>Name</Text>
                    <Text style={s.partyValue}>{draft.customerName}</Text>
                  </View>
                  <View style={s.partyRow}>
                    <Text style={s.partyLabel}>Address</Text>
                    <Text style={s.partyValue}>{draft.customerAddress}</Text>
                  </View>
                  <View style={s.partyRow}>
                    <Text style={s.partyLabel}>State</Text>
                    <Text style={s.partyValue}>{draft.customerState}</Text>
                    {draft.transportId ? (
                      <>
                        <Text style={[s.partyLabel, { width: 72, textAlign: 'right', paddingRight: 4 }]}>
                          Transport ID
                        </Text>
                        <Text style={[s.partyValue, { flexGrow: 2 }]}>{draft.transportId}</Text>
                      </>
                    ) : null}
                  </View>
                  <View style={s.partyRow}>
                    <Text style={s.partyLabel}>GSTIN No</Text>
                    <Text style={[s.partyValue, { flexGrow: 2 }]}>{draft.partyGstin}</Text>
                    <Text style={[s.partyLabel, { width: 72, textAlign: 'right', paddingRight: 4 }]}>
                      {draft.transportId ? 'Transport Name' : 'Transport'}
                    </Text>
                    <Text style={[s.partyValue, { flexGrow: 2 }]}>{draft.transport}</Text>
                  </View>
                  {/* The pad's unlabelled continuation rule — where a long address or
                      a second transport reference is carried on by hand. Anything the
                      admin typed in Notes prints here rather than being dropped. */}
                  <View style={s.partyRow}>
                    <Text style={[s.partyValue, { paddingLeft: 0 }]}>{draft.notes}</Text>
                  </View>
                </View>

                {/* ═══ GRID HEAD ═══ */}
                <View style={s.headRow}>
                  {showCases &&
                    cell(
                      'h0',
                      COL_WITH_CASES.cases,
                      <>
                        <Text style={s.headTextSmall}>No.of</Text>
                        <Text style={s.headTextSmall}>Cases</Text>
                      </>,
                    )}
                  {cell('h1', col.sno, <Text style={s.headText}>S.No.</Text>)}
                  {cell('h2', col.particulars, <Text style={s.headText}>PARTICULARS</Text>)}
                  {cell('h3', col.qty, <Text style={s.headText}>Qty.</Text>)}
                  {cell(
                    'h4',
                    col.rate,
                    <>
                      <Text style={s.headTextSmall}>Rate</Text>
                      <Text style={s.headTextSmall}>Per Case</Text>
                    </>,
                  )}
                  {/* One "Amount" caption spanning the Rs. and Ps. columns, exactly as
                      the pad prints it, with the two sub-captions beneath. */}
                  <View style={[s.cellLast, { width: w(col.rupees + col.paise), paddingHorizontal: 0 }]}>
                    <Text style={s.headTextSmall}>Amount</Text>
                    {/* The rule between Rs. and Ps. starts below the shared caption,
                        matching how the pad prints it. */}
                    <View style={{ flexDirection: 'row', marginTop: 1 }}>
                      <Text style={[s.headTextSmall, { width: w(col.rupees) }]}>Rs.</Text>
                      <Text style={[s.headTextSmall, { width: w(col.paise), borderLeft: rule }]}>Ps.</Text>
                    </View>
                  </View>
                </View>

                {/* ═══ GRID ROWS ═══ */}
                {/* Padded out to the sheet's row count with blank ruled rows, so a
                    two-line invoice looks like the same sheet as a twelve-line one. */}
                {Array.from({ length: rowsPerPage }).map((__, r) => {
                  const i = first + r;
                  const line = lines[i];
                  const { rupees, paise } = splitAmount(line ? (f.lineAmounts[i] ?? 0) : 0);
                  return (
                    <View key={`r${i}`} style={[s.row, { height: rowHeight }]}>
                      {showCases &&
                        cell(
                          `c0${i}`,
                          COL_WITH_CASES.cases,
                          line ? <Text style={s.bodyCentre}>{line.caseLabel ?? ''}</Text> : null,
                        )}
                      {cell(`c1${i}`, col.sno, line ? <Text style={s.bodyCentre}>{i + 1}</Text> : null)}
                      {cell(
                        `c2${i}`,
                        col.particulars,
                        line ? <Text style={s.bodyText}>{line.name}</Text> : null,
                      )}
                      {cell(`c3${i}`, col.qty, line ? <Text style={s.bodyCentre}>{line.quantity}</Text> : null)}
                      {cell(
                        `c4${i}`,
                        col.rate,
                        line ? <Text style={s.bodyNum}>{line.unitPrice.toFixed(2)}</Text> : null,
                      )}
                      {cell(`c5${i}`, col.rupees, line ? <Text style={s.bodyNum}>{rupees}</Text> : null)}
                      {cell(`c6${i}`, col.paise, line ? <Text style={s.bodyNum}>{paise}</Text> : null, true)}
                    </View>
                  );
                })}

                {/* ═══ HSN ═══ */}
                <View style={s.hsnRow}>
                  <View style={[s.cell, { width: w(col.sno + col.particulars), paddingHorizontal: 0 }]}>
                    <View style={s.hsnPill}>
                      <Text style={s.hsnLabel}>HSN No.:</Text>
                      <Text style={s.hsnValue}>{draft.hsnCode || t.hsnCode}</Text>
                    </View>
                  </View>
                  {cell('hsnq', col.qty, null)}
                  {cell('hsnr', col.rate, null)}
                  {cell('hsnrs', col.rupees, null)}
                  {cell('hsnps', col.paise, null, true)}
                </View>

                {/* ═══ TOTALS ═══ */}
                <View style={s.totals}>
                  <View style={s.wordsPane}>
                    {isLast ? (
                      <>
                        {/* Three leader lines, as the pad prints them: the amount in
                            words starts on the first and the "Only." closes the third,
                            so a long figure has room and a short one still looks right. */}
                        <View style={s.wordsRow}>
                          <Text style={s.wordsLabel}>Rupees</Text>
                          <Text style={s.wordsLine}>{amountWords[0]}</Text>
                        </View>
                        <View style={s.wordsRow}>
                          <Text style={s.wordsLine}>{amountWords[1]}</Text>
                        </View>
                        <View style={s.wordsRow}>
                          <Text style={s.wordsLine}>{amountWords[2]}</Text>
                          <Text style={s.wordsLabel}> Only.</Text>
                        </View>
                      </>
                    ) : (
                      <Text style={s.wordsLabel}>Continued on page {pageIndex + 2}</Text>
                    )}
                    <Text style={s.eoe}>{t.eoeLabel}</Text>
                  </View>

                  <View style={s.totalsLabelCol}>
                    {totalRows.map((row, k) => (
                      <View key={`tl${k}`} style={k === totalRows.length - 1 ? s.totalsCellLast : s.totalsCell}>
                        <Text style={row.bold ? s.totalsLabelBold : s.totalsLabel}>{row.label}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={s.totalsValueCol}>
                    {/* The figures print once, on the sheet that ends the invoice. */}
                    {totalRows.map((row, k) => (
                      <View key={`tv${k}`} style={k === totalRows.length - 1 ? s.totalsCellLast : s.totalsCell}>
                        <Text style={row.bold ? s.totalsValueBold : s.totalsValue}>{isLast ? row.value : ''}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* ═══ TERMS & SIGNATURE ═══ */}
                <View style={s.sign}>
                  <View style={s.signTerms}>
                    {termsLines.map((line, k) => (
                      <Text key={`term${k}`} style={s.termsText}>
                        {line}
                      </Text>
                    ))}
                    {t.checkedByLabel || t.preparedByLabel ? (
                      <View style={s.signedByRow}>
                        {t.checkedByLabel ? <Text style={s.signedBy}>{t.checkedByLabel}</Text> : null}
                        {t.preparedByLabel ? <Text style={s.signedBy}>{t.preparedByLabel}</Text> : null}
                      </View>
                    ) : null}
                  </View>

                  <View style={s.signFor}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                      <Text style={s.forLabel}>For </Text>
                      <Text style={s.forName}>{t.forLabel || t.shopName}</Text>
                    </View>
                    <Text style={s.signatory}>
                      {pageCount > 1 ? `Page ${pageIndex + 1} of ${pageCount}    ` : ''}
                      {t.signatoryLabel}
                    </Text>
                  </View>
                </View>

              </View>
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
