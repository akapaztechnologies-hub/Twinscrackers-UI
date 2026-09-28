/**
 * Amounts spelled out in the Indian numbering system (crore / lakh / thousand).
 *
 * Extracted from BillPDF so the wholesale case invoice — whose "Rupees ……… Only"
 * line is a printed field, not a footnote — spells figures the same way the tax
 * invoice always has.
 */

const ones = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ones[n];
  return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
}

/**
 * A whole number in words, without the trailing "Only".
 *
 * The crore part is spelled by the same rule, so a figure of 100 crore or more
 * reads "One Hundred Crore" — `twoDigits` alone printed "undefined Crore" there.
 */
function spell(n: number): string {
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const hundred = Math.floor((n % 1000) / 100);
  const rest = n % 100;

  const parts: string[] = [];
  if (crore) parts.push(spell(crore) + ' Crore');
  if (lakh) parts.push(twoDigits(lakh) + ' Lakh');
  if (thousand) parts.push(twoDigits(thousand) + ' Thousand');
  if (hundred) parts.push(ones[hundred] + ' Hundred');
  if (rest) parts.push(twoDigits(rest));
  return parts.join(' ');
}

/** e.g. 1280 -> "One Thousand Two Hundred Eighty Only". Rounds to whole rupees. */
export function numberToWords(num: number): string {
  if (!Number.isFinite(num) || Math.round(num) === 0) return 'Zero Only';
  return spell(Math.abs(Math.round(num))) + ' Only';
}
