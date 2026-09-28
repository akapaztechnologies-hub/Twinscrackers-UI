/**
 * The factory's own billing — a separate firm from the shop.
 *
 * Its products carry no stock, no images and no web listing: the factory makes
 * and sells in cases to traders, so a line on its bill is a description, a
 * quantity and a rate. Nothing here touches the shop's catalogue, counter
 * takings or stock ledger.
 */

/** The pad's "Per" column. Free text on the bill; these are just the common ones. */
export const FACTORY_UNITS = ['CASE', 'BOX', 'PKT', 'NOS', 'KG', 'BAG'] as const;

export interface FactoryProduct {
  id: string;
  name: string;
  /** Default rate for one `per` unit. Editable on the bill. */
  rate: number;
  per: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface FactoryProductInput {
  name: string;
  rate?: number;
  per?: string;
  isActive?: boolean;
}

export interface FactoryBillItem {
  product?: string;
  name: string;
  /**
   * The "No of Cases" column: free text, so a bill can carry a range
   * ("15 to 30") as the pad does. Never part of the money — that is
   * quantity × rate.
   */
  cases: string;
  quantity: number;
  rate: number;
  per: string;
  amount: number;
}

export type FactoryPaymentMode = 'cash' | 'credit';

export interface FactoryBill {
  id: string;
  invoiceNumber: string;
  invoiceSeq: number;
  invoiceDate: string;
  party: { name: string; address: string; gstin: string; state: string };
  transportId: string;
  transportName: string;
  items: FactoryBillItem[];
  /** 'inter' prints IGST in place of CGST + SGST. */
  taxKind: 'intra' | 'inter';
  gstRate: number;
  taxableValue: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  roundOff: number;
  manualRoundOff?: number | null;
  grandTotal: number;
  paymentMode: FactoryPaymentMode;
  notes: string;
  status: 'active' | 'cancelled';
  createdAt?: string;
}

/** One row being filled in on the screen, before it is priced. */
export interface FactoryBillLineDraft {
  /** Local row id, so React keys survive reordering and deletion. */
  key: string;
  product?: string;
  name: string;
  /** Held as text: a half-typed "1." must not become 1 under the cursor. */
  cases: string;
  quantity: string;
  rate: string;
  per: string;
}

/** Everything the admin fills in for one factory bill. */
export interface FactoryBillDraft {
  /** Blank leaves the number to the run; anything typed overrides it. */
  invoiceNumber: string;
  invoiceDate: string;
  partyName: string;
  partyAddress: string;
  partyGstin: string;
  partyState: string;
  transportId: string;
  transportName: string;
  lines: FactoryBillLineDraft[];
  taxKind: 'intra' | 'inter';
  gstRate: number;
  /** Blank means "use the derived round-off"; a number overrides it. */
  manualRoundOff: string;
  paymentMode: FactoryPaymentMode;
  notes: string;
}

export interface FactoryBillTotals {
  taxableValue: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  roundOff: number;
  grandTotal: number;
  lineAmounts: number[];
}

export function emptyLine(): FactoryBillLineDraft {
  return {
    key: Math.random().toString(36).slice(2),
    name: '',
    cases: '',
    quantity: '',
    rate: '',
    per: 'CASE',
  };
}

export function emptyFactoryDraft(): FactoryBillDraft {
  return {
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    partyName: '',
    partyAddress: '',
    partyGstin: '',
    partyState: '',
    transportId: '',
    transportName: '',
    lines: [emptyLine(), emptyLine(), emptyLine()],
    taxKind: 'intra',
    gstRate: 18,
    manualRoundOff: '',
    paymentMode: 'cash',
    notes: '',
  };
}

const money = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const num = (s: string) => {
  const n = Number(String(s).trim());
  return Number.isFinite(n) ? n : 0;
};

/** A row the server will price: it needs a description and a quantity. */
export function isPricedFactoryLine(line: FactoryBillLineDraft): boolean {
  return Boolean(line.name.trim()) && num(line.quantity) > 0;
}

/**
 * Price the draft exactly as the server prices it on save, so the figures on
 * screen and the figures printed on the pad can never disagree.
 */
export function factoryDraftTotals(draft: FactoryBillDraft): FactoryBillTotals {
  const priced = draft.lines.filter(isPricedFactoryLine);
  const lineAmounts = priced.map((l) => money(num(l.quantity) * num(l.rate)));
  const taxableValue = money(lineAmounts.reduce((s, a) => s + a, 0));
  const tax = money((taxableValue * (Number(draft.gstRate) || 0)) / 100);
  const inter = draft.taxKind === 'inter';
  const halfTax = money(tax / 2);
  const totalIgst = inter ? tax : 0;
  const totalCgst = inter ? 0 : halfTax;
  const totalSgst = inter ? 0 : money(tax - halfTax);

  const beforeRounding = money(taxableValue + totalCgst + totalSgst + totalIgst);
  const typed = draft.manualRoundOff.trim();
  const roundOff =
    typed === '' || !Number.isFinite(Number(typed))
      ? money(Math.round(beforeRounding) - beforeRounding)
      : money(Number(typed));

  return {
    taxableValue,
    totalCgst,
    totalSgst,
    totalIgst,
    roundOff,
    grandTotal: money(beforeRounding + roundOff),
    lineAmounts,
  };
}

/** The payload the API expects, built from a draft. */
export function factoryDraftToPayload(draft: FactoryBillDraft) {
  const typed = draft.manualRoundOff.trim();
  return {
    invoiceNumber: draft.invoiceNumber.trim(),
    invoiceDate: draft.invoiceDate,
    party: {
      name: draft.partyName.trim(),
      address: draft.partyAddress.trim(),
      gstin: draft.partyGstin.trim().toUpperCase(),
      state: draft.partyState.trim(),
    },
    transportId: draft.transportId.trim(),
    transportName: draft.transportName.trim(),
    items: draft.lines.filter(isPricedFactoryLine).map((l) => ({
      product: l.product,
      name: l.name.trim(),
      cases: l.cases.trim(),
      quantity: num(l.quantity),
      rate: num(l.rate),
      per: (l.per || 'CASE').trim().toUpperCase(),
    })),
    taxKind: draft.taxKind,
    gstRate: Number(draft.gstRate) || 0,
    manualRoundOff: typed === '' || !Number.isFinite(Number(typed)) ? null : Number(typed),
    paymentMode: draft.paymentMode,
    notes: draft.notes.trim(),
  };
}

/** Read a saved bill back into the editable draft. */
export function factoryBillToDraft(bill: FactoryBill): FactoryBillDraft {
  return {
    invoiceNumber: bill.invoiceNumber ?? '',
    invoiceDate: (bill.invoiceDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    partyName: bill.party?.name ?? '',
    partyAddress: bill.party?.address ?? '',
    partyGstin: bill.party?.gstin ?? '',
    partyState: bill.party?.state ?? '',
    transportId: bill.transportId ?? '',
    transportName: bill.transportName ?? '',
    lines: (bill.items ?? []).map((it) => ({
      key: Math.random().toString(36).slice(2),
      product: it.product,
      name: it.name,
      cases: it.cases ? String(it.cases) : '',
      quantity: String(it.quantity),
      rate: String(it.rate),
      per: it.per || 'CASE',
    })),
    taxKind: bill.taxKind ?? 'intra',
    gstRate: bill.gstRate ?? 18,
    // A saved bill's round-off is kept as typed only when it is not the derived one.
    manualRoundOff:
      typeof bill.manualRoundOff === 'number' && Number.isFinite(bill.manualRoundOff)
        ? String(bill.manualRoundOff)
        : '',
    paymentMode: bill.paymentMode ?? 'cash',
    notes: bill.notes ?? '',
  };
}
