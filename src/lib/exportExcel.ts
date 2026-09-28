/**
 * Client-side .xlsx export for the admin's list and report screens.
 *
 * These screens already hold the rows they show, so their export is built in
 * the browser rather than round-tripping to the server. It used to be raw CSV,
 * which opened badly every time: columns clipped to their default width, phone
 * numbers reinterpreted as `8.06E+09`, money as bare integers, and Excel's
 * "possible data loss" banner across the top of the sheet.
 *
 * Same look as the server-side exports in the backend's utils/xlsx.ts — widths
 * measured from the content, a frozen bold header, ₹ on money columns.
 *
 * ExcelJS is loaded on demand, so the ~250KB it costs is only paid by someone
 * who actually clicks Export.
 */
import type { Workbook } from 'exceljs';

/** Headers whose values are money, however the page happens to word them. */
const MONEY_HEADER =
  /(total|subtotal|amount|revenue|sales|price|rate|discount|gst|cgst|sgst|igst|paid|due|balance|outstanding|cost|expense|profit|value|commission|payout)/i;

/**
 * Headers that must stay text even when every value looks numeric.
 *
 * A phone number written as a number becomes `8.06E+09`, and a bill number like
 * `2609` loses its leading zeros. Excel does this on open, so the cell has to be
 * a string before it ever gets there.
 */
const TEXT_HEADER = /(phone|mobile|contact|whatsapp|pincode|pin code|gstin|code|^id$|\bno\.?$|number)/i;

/** A "%" column is a plain number; the header already says what it is. */
const PERCENT_HEADER = /%/;

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } } as const;
const CURRENCY_FORMAT = '₹#,##0';
const NUMBER_FORMAT = '#,##0';

const MIN_WIDTH = 9;
const MAX_WIDTH = 42;
const LONGTEXT_WIDTH = 50;

type CellFormat = 'text' | 'longtext' | 'number' | 'currency';

/** Decide how a column behaves from its header and the values underneath it. */
function inferFormat(header: string, values: unknown[]): CellFormat {
  if (TEXT_HEADER.test(header)) return 'text';

  const present = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (present.length > 0 && present.every((v) => typeof v === 'number')) {
    if (PERCENT_HEADER.test(header)) return 'number';
    return MONEY_HEADER.test(header) ? 'currency' : 'number';
  }

  const longest = values.reduce<number>((m, v) => Math.max(m, String(v ?? '').length), 0);
  return longest > MAX_WIDTH ? 'longtext' : 'text';
}

export interface SheetSpec {
  /** Tab name. Excel forbids []:*?/\ and caps it at 31 characters. */
  name: string;
  /** Keyed by the header text to show, in order. The first row decides the columns. */
  rows: Record<string, unknown>[];
  /** An italic note above the header row. */
  caption?: string;
  /** Force a column's treatment where the header alone would guess wrong. */
  formats?: Record<string, CellFormat>;
}

function addSheet(workbook: Workbook, spec: SheetSpec): void {
  const { rows, caption } = spec;
  const headers = Object.keys(rows[0]);

  const sheet = workbook.addWorksheet(spec.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet1', {
    views: [{ state: 'frozen', ySplit: caption ? 2 : 1 }],
  });

  if (caption) {
    sheet.mergeCells(1, 1, 1, headers.length);
    const cell = sheet.getCell(1, 1);
    cell.value = caption;
    cell.font = { italic: true, size: 10, color: { argb: 'FF6B7280' } };
    sheet.getRow(1).height = 20;
  }

  const headerRowNo = caption ? 2 : 1;
  const headerRow = sheet.getRow(headerRowNo);
  headers.forEach((header, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = HEADER_FILL as never;
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  });
  headerRow.height = 22;

  const formats = headers.map(
    (header) => spec.formats?.[header] ?? inferFormat(header, rows.map((r) => r[header])),
  );

  rows.forEach((row) => {
    const added = sheet.addRow(
      headers.map((header, i) => {
        const value = row[header];
        if (value === null || value === undefined || value === '') return null;
        // A text column takes the string even when the value is a number —
        // that is what stops Excel rewriting a phone number in scientific
        // notation the moment the file opens.
        return formats[i] === 'text' || formats[i] === 'longtext' ? String(value) : value;
      }),
    );
    formats.forEach((format, i) => {
      const cell = added.getCell(i + 1);
      if (format === 'currency') cell.numFmt = CURRENCY_FORMAT;
      else if (format === 'number') cell.numFmt = NUMBER_FORMAT;
      else if (format === 'longtext') cell.alignment = { wrapText: true, vertical: 'top' };
    });
  });

  // Widths from the content — the whole reason these are workbooks now.
  headers.forEach((header, i) => {
    const column = sheet.getColumn(i + 1);
    if (formats[i] === 'longtext') {
      column.width = LONGTEXT_WIDTH;
    } else {
      const longest = rows.reduce(
        (max, row) => Math.max(max, String(row[header] ?? '').length),
        header.length,
      );
      column.width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, longest + 3));
    }
    if (formats[i] === 'currency' || formats[i] === 'number') {
      column.alignment = { horizontal: 'right' };
    }
  });

  sheet.autoFilter = {
    from: { row: headerRowNo, column: 1 },
    to: { row: headerRowNo, column: headers.length },
  };
}

async function download(sheets: SheetSpec[], filename: string): Promise<void> {
  const filled = sheets.filter((s) => s.rows.length > 0);
  if (filled.length === 0) return;

  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  filled.forEach((spec) => addSheet(workbook, spec));

  const blob = new Blob([await workbook.xlsx.writeBuffer()], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in Safari; one tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One table, one sheet. The drop-in replacement for the old CSV writer. */
export function exportToExcel(
  rows: Record<string, unknown>[],
  filename: string,
  options: Omit<SheetSpec, 'name' | 'rows'> & { sheetName?: string } = {},
): Promise<void> {
  return download(
    [{ name: options.sheetName ?? filename, rows, caption: options.caption, formats: options.formats }],
    filename,
  );
}

/**
 * Several tables in one workbook, each on its own tab.
 *
 * For the reports that used to concatenate sections into a single CSV with
 * blank rows between them — a shape nothing can filter or sort.
 */
export function exportSheetsToExcel(sheets: SheetSpec[], filename: string): Promise<void> {
  return download(sheets, filename);
}
