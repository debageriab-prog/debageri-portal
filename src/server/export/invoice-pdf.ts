import type { InvoiceLine } from "@/domain/finance/invoice-lines";
import { formatQuantity } from "@/domain/finance/invoice-lines";
import {
  isDomesticCountry,
  type InvoiceSettings,
  type PostalAddress,
} from "@/domain/finance/invoice-settings";
import { pdfDocument, PdfPage, wrapText } from "./pdf-document";

export { PDF_CONTENT_TYPE } from "./pdf-document";

/**
 * Writes a customer invoice as an A4 PDF, laid out like a Swedish invoice:
 * the sender and invoice facts on top, the customer's address, references
 * and terms, the rows, the VAT summary and totals, how to pay, and a footer
 * with the company's registration and bank details.
 */

export type InvoicePdfLabels = Record<
  | "title"
  | "invoiceDate"
  | "invoiceNumber"
  | "ocr"
  | "bankgiro"
  | "dueDate"
  | "ourReference"
  | "yourReference"
  | "paymentTerms"
  | "paymentTermsDays"
  | "lateInterest"
  | "customerNumber"
  | "customerOrgNumber"
  | "customerVatNumber"
  | "articleNumber"
  | "description"
  | "quantity"
  | "unit"
  | "unitPrice"
  | "amount"
  | "vatLine"
  | "net"
  | "vat"
  | "rounding"
  | "toPay"
  | "payWithOcr"
  | "payWithReference"
  | "iban"
  | "bic"
  | "address"
  | "contact"
  | "registration"
  | "payment"
  | "phone"
  | "email"
  | "orgNumber"
  | "vatNumber"
  | "fSkatt"
  | "page"
  | "slipTitle"
  | "slipHowToPay"
  | "slipToPay"
  | "slipToBankgiro"
  | "slipDueBy"
  | "slipFee"
  | "slipPayer"
  | "slipBankgiroBox"
  | "slipPayee"
  | "slipNoChanges"
  | "slipNoMessages"
  | "slipMachineRead"
  | "slipReference"
  | "slipKronor"
  | "slipOre",
  string
>;

export type InvoicePdfInput = {
  issuer: InvoiceSettings;
  customer: PostalAddress & {
    name: string;
    customerNumber: string;
    orgNumber: string;
    vatNumber: string;
  };
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  ocrReference: string | null;
  ourReference: string;
  yourReference: string;
  paymentTermsDays: number;
  lines: InvoiceLine[];
  invoiceText: string;
  vatRateBps: number;
  netMinor: number;
  vatMinor: number;
  roundingMinor: number;
  grossMinor: number;
  /**
   * Bankgirot's code line for the payment slip at the foot of the last
   * page; no slip when null.
   */
  codeLine: string | null;
  labels: InvoicePdfLabels;
};

const WIDTH = 595;
const HEIGHT = 842;
const MARGIN = 48;
const RIGHT = WIDTH - MARGIN;
const RIGHT_COLUMN = 330;
const FOOTER_TOP = 762;
const MUTED = "6b5a4e";
const RULE = "c9b8a8";
const HEADER_FILL = "f3ece4";

const money = (minor: number) =>
  new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(minor / 100)
    .replace(/−/g, "-");

const percent = (bps: number) =>
  new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(
    bps / 100,
  );

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);

function addressLines(address: PostalAddress) {
  return [
    address.addressLine,
    [address.postalCode, address.city].filter(Boolean).join(" "),
    isDomesticCountry(address.country) ? "" : address.country,
  ].filter((line) => line.trim());
}

/** Label and value pairs, the values lined up in one column. */
function facts(
  page: PdfPage,
  rows: Array<[string, string]>,
  x: number,
  top: number,
  valueX: number,
  size = 9,
) {
  let y = top;
  for (const [label, value] of rows) {
    if (!value) continue;
    page.text(label, x, y, size, { color: MUTED });
    page.text(value, valueX, y, size);
    y += size + 5;
  }
  return y;
}

const COLUMNS = {
  article: { x: MARGIN, width: 46 },
  description: { x: MARGIN + 50, width: 206 },
  quantity: { x: 304, width: 52 },
  unit: { x: 362, width: 34 },
  price: { x: 400, width: 70 },
  amount: { x: 474, width: RIGHT - 474 },
};

function tableHeader(page: PdfPage, labels: InvoicePdfLabels, top: number) {
  page.rect(MARGIN, top, RIGHT - MARGIN, 18, { fill: HEADER_FILL });
  const y = top + 5;
  const size = 8.5;
  page.text(labels.articleNumber, COLUMNS.article.x + 4, y, size, {
    bold: true,
  });
  page.text(labels.description, COLUMNS.description.x, y, size, {
    bold: true,
  });
  page.text(labels.quantity, COLUMNS.quantity.x, y, size, {
    bold: true,
    align: "right",
    width: COLUMNS.quantity.width,
  });
  page.text(labels.unit, COLUMNS.unit.x, y, size, { bold: true });
  page.text(labels.unitPrice, COLUMNS.price.x, y, size, {
    bold: true,
    align: "right",
    width: COLUMNS.price.width,
  });
  page.text(labels.amount, COLUMNS.amount.x, y, size, {
    bold: true,
    align: "right",
    width: COLUMNS.amount.width - 4,
  });
  return top + 24;
}

function footer(page: PdfPage, input: InvoicePdfInput) {
  const { issuer, labels } = input;
  page.line(MARGIN, FOOTER_TOP, RIGHT, FOOTER_TOP, { color: RULE });
  const size = 7.5;
  const columnWidth = (RIGHT - MARGIN) / 4;
  const columns: Array<[string, string[]]> = [
    [labels.address, [issuer.legalName, ...addressLines(issuer)]],
    [
      labels.contact,
      [
        issuer.phone && `${labels.phone} ${issuer.phone}`,
        issuer.email,
        issuer.website,
      ].filter(Boolean),
    ],
    [
      labels.registration,
      [
        issuer.orgNumber && `${labels.orgNumber} ${issuer.orgNumber}`,
        issuer.vatNumber && `${labels.vatNumber} ${issuer.vatNumber}`,
        issuer.fSkatt ? labels.fSkatt : "",
      ].filter(Boolean),
    ],
    [
      labels.payment,
      [
        issuer.bankgiro && `${labels.bankgiro} ${issuer.bankgiro}`,
        issuer.iban && `${labels.iban} ${issuer.iban}`,
        issuer.bic && `${labels.bic} ${issuer.bic}`,
        issuer.bankName,
      ].filter(Boolean),
    ],
  ];
  columns.forEach(([title, lines], index) => {
    const x = MARGIN + index * columnWidth;
    page.text(title, x, FOOTER_TOP + 8, size, { bold: true, color: MUTED });
    lines.forEach((line, row) =>
      page.text(line, x, FOOTER_TOP + 19 + row * (size + 3), size, {
        color: MUTED,
      }),
    );
  });
}

function pageNumber(
  page: PdfPage,
  labels: InvoicePdfLabels,
  index: number,
  count: number,
) {
  if (count < 2) return;
  page.text(
    fill(labels.page, { page: String(index + 1), pages: String(count) }),
    MARGIN,
    HEIGHT - 28,
    7.5,
    { color: MUTED, align: "right", width: RIGHT - MARGIN },
  );
}

/** The top of the first page: sender, invoice facts and the customer. */
function firstPageHead(page: PdfPage, input: InvoicePdfInput) {
  const { issuer, customer, labels } = input;
  page.text(issuer.legalName, MARGIN, MARGIN, 16, { bold: true });
  let left = MARGIN + 24;
  for (const line of [
    addressLines(issuer).join(", "),
    [
      issuer.phone && `${labels.phone} ${issuer.phone}`,
      issuer.email && `${labels.email} ${issuer.email}`,
    ]
      .filter(Boolean)
      .join(", "),
    [
      issuer.orgNumber && `${labels.orgNumber} ${issuer.orgNumber}`,
      issuer.vatNumber && `${labels.vatNumber} ${issuer.vatNumber}`,
    ]
      .filter(Boolean)
      .join(", "),
    issuer.fSkatt ? labels.fSkatt : "",
  ]) {
    if (!line) continue;
    page.text(line, MARGIN, left, 8.5, { color: MUTED });
    left += 12;
  }

  page.text(labels.title, RIGHT_COLUMN, MARGIN, 20, { bold: true });
  facts(
    page,
    [
      [labels.invoiceDate, input.issueDate],
      [labels.invoiceNumber, input.invoiceNumber],
      [labels.ocr, input.ocrReference ?? ""],
      [labels.bankgiro, issuer.bankgiro],
    ],
    RIGHT_COLUMN,
    MARGIN + 30,
    RIGHT_COLUMN + 92,
  );

  let customerTop = 158;
  page.text(customer.name, RIGHT_COLUMN, customerTop, 10.5, { bold: true });
  customerTop += 15;
  for (const line of addressLines(customer)) {
    page.text(line, RIGHT_COLUMN, customerTop, 10);
    customerTop += 13;
  }

  const referencesTop = 240;
  page.line(MARGIN, referencesTop - 8, RIGHT, referencesTop - 8, {
    color: RULE,
  });
  const leftEnd = facts(
    page,
    [
      [labels.ourReference, input.ourReference],
      [
        labels.paymentTerms,
        fill(labels.paymentTermsDays, { days: String(input.paymentTermsDays) }),
      ],
      [labels.dueDate, input.dueDate],
      [labels.lateInterest, issuer.lateInterestText],
    ],
    MARGIN,
    referencesTop,
    MARGIN + 100,
  );
  const rightEnd = facts(
    page,
    [
      [labels.invoiceNumber, input.invoiceNumber],
      [labels.customerNumber, customer.customerNumber],
      [labels.yourReference, input.yourReference],
      [labels.customerOrgNumber, customer.orgNumber],
      [labels.customerVatNumber, customer.vatNumber],
    ],
    RIGHT_COLUMN,
    referencesTop,
    RIGHT_COLUMN + 92,
  );
  return Math.max(leftEnd, rightEnd) + 16;
}

export function invoicePdf(input: InvoicePdfInput): Buffer {
  const { labels } = input;
  const pages: PdfPage[] = [new PdfPage(WIDTH, HEIGHT)];
  let page = pages[0]!;
  let y = firstPageHead(page, input);
  y = tableHeader(page, labels, y);
  const bottom = FOOTER_TOP - 16;
  const newPage = () => {
    page = new PdfPage(WIDTH, HEIGHT);
    pages.push(page);
    y = tableHeader(page, labels, MARGIN);
  };

  const size = 9;
  for (const line of input.lines) {
    const description = wrapText(
      line.description,
      COLUMNS.description.width,
      size,
    );
    const height = description.length * (size + 3) + 4;
    if (y + height > bottom) newPage();
    page.text(line.articleNumber, COLUMNS.article.x + 4, y, size);
    description.forEach((text, index) =>
      page.text(text, COLUMNS.description.x, y + index * (size + 3), size),
    );
    page.text(
      formatQuantity(line.quantityThousandths, "sv-SE"),
      COLUMNS.quantity.x,
      y,
      size,
      { align: "right", width: COLUMNS.quantity.width },
    );
    page.text(line.unit, COLUMNS.unit.x, y, size);
    page.text(money(line.unitPriceMinor), COLUMNS.price.x, y, size, {
      align: "right",
      width: COLUMNS.price.width,
    });
    page.text(money(line.amountMinor), COLUMNS.amount.x, y, size, {
      align: "right",
      width: COLUMNS.amount.width - 4,
    });
    y += height;
  }

  if (input.invoiceText.trim()) {
    const text = wrapText(input.invoiceText, RIGHT - MARGIN - 50, size);
    y += 6;
    for (const line of text) {
      if (y + size + 3 > bottom) newPage();
      page.text(line, COLUMNS.description.x, y, size, { color: MUTED });
      y += size + 3;
    }
  }

  // The summary, totals and payment box stay together, and with a payment
  // slip they must also end above it.
  const slip = Boolean(input.codeLine);
  const summaryHeight = slip ? 92 : 150;
  const summaryBottom = slip ? SLIP_TOP - 14 : bottom;
  if (y + summaryHeight > summaryBottom) {
    page = new PdfPage(WIDTH, HEIGHT);
    pages.push(page);
    y = MARGIN;
  }
  y += 14;
  page.text(
    fill(labels.vatLine, {
      rate: percent(input.vatRateBps),
      vat: money(input.vatMinor),
      net: money(input.netMinor),
    }),
    MARGIN,
    y,
    size,
  );
  y += 22;
  page.line(MARGIN, y, RIGHT, y, { color: "000000", width: 0.8 });
  y += 8;
  const totalColumns: Array<[string, string]> = [
    [labels.net, money(input.netMinor)],
    [labels.vat, money(input.vatMinor)],
    [labels.rounding, money(input.roundingMinor)],
  ];
  const columnWidth = 92;
  totalColumns.forEach(([label, value], index) => {
    const x = MARGIN + index * columnWidth;
    page.text(label, x, y, 8.5, { color: MUTED });
    page.text(value, x, y + 13, 10);
  });
  page.text(labels.toPay, RIGHT - 180, y, 8.5, {
    color: MUTED,
    align: "right",
    width: 180,
  });
  const total = `${money(input.grossMinor)} SEK`;
  page.text(total, RIGHT - 220, y + 12, 14, {
    bold: true,
    align: "right",
    width: 220,
  });
  y += 44;

  const issuer = input.issuer;
  if (input.codeLine) {
    // The slip says how to pay, so the payment box is left out.
    paymentSlip(page, input, input.codeLine, total);
  } else {
    const payment = fill(
      input.ocrReference ? labels.payWithOcr : labels.payWithReference,
      {
        amount: total,
        bankgiro: issuer.bankgiro,
        dueDate: input.dueDate,
        ocr: input.ocrReference ?? "",
        invoiceNumber: input.invoiceNumber,
      },
    );
    const bank = [
      issuer.iban && `${labels.iban} ${issuer.iban}`,
      issuer.bic && `${labels.bic} ${issuer.bic}`,
    ]
      .filter(Boolean)
      .join("   ");
    const boxLines = [
      ...wrapText(payment, RIGHT - MARGIN - 24, 9.5, true),
      ...(bank ? [bank] : []),
    ];
    const boxHeight = 16 + boxLines.length * 13;
    page.rect(MARGIN, y, RIGHT - MARGIN, boxHeight, { stroke: "000000" });
    boxLines.forEach((line, index) =>
      page.text(line, MARGIN + 12, y + 9 + index * 13, 9.5, {
        bold: index < boxLines.length - (bank ? 1 : 0),
        color: index >= boxLines.length - (bank ? 1 : 0) ? MUTED : "000000",
      }),
    );
  }

  pages.forEach((item, index) => {
    // The slip takes the foot of its page; the company details are in the
    // first page's heading already.
    if (!(slip && index === pages.length - 1)) footer(item, input);
    pageNumber(item, labels, index, pages.length);
  });
  return pdfDocument(pages);
}

/** Height of a bankgiro payment slip: four inches. */
const SLIP_HEIGHT = 288;
const SLIP_TOP = HEIGHT - SLIP_HEIGHT;
/** Courier at 12 pt is ten characters per inch, Bankgirot's pitch. */
const CODE_FONT_SIZE = 12;
const CODE_PITCH = 7.2;
/** The code line's baseline sits 4/6 inch above the slip's lower edge. */
const CODE_BASELINE = HEIGHT - 48;

/**
 * An "Inbetalning/Girering AVI" across the foot of the page: how to pay on
 * the left, payer, bankgiro and payee on the right, and the machine-read
 * code line that bank apps scan for the bankgiro, amount and OCR number.
 */
function paymentSlip(
  page: PdfPage,
  input: InvoicePdfInput,
  codeLine: string,
  total: string,
) {
  const { issuer, customer, labels } = input;
  page.line(0, SLIP_TOP, WIDTH, SLIP_TOP, { color: MUTED, dash: [3, 3] });
  const left = 28;
  const right = 300;
  const edge = WIDTH - 28;

  page.text(labels.slipHowToPay, left, SLIP_TOP + 24, 10, { bold: true });
  facts(
    page,
    [
      [labels.slipToPay, total],
      [labels.slipToBankgiro, issuer.bankgiro],
      [labels.slipDueBy, input.dueDate],
      [labels.ocr, input.ocrReference ?? ""],
    ],
    left,
    SLIP_TOP + 44,
    left + 92,
    10,
  );

  page.text(labels.slipTitle, right, SLIP_TOP + 14, 9, { bold: true });
  page.text("OCR", right, SLIP_TOP + 14, 9, {
    bold: true,
    align: "right",
    width: edge - right,
  });
  page.rect(edge - 120, SLIP_TOP + 30, 120, 26, { stroke: MUTED });
  page.text(labels.slipFee, edge - 116, SLIP_TOP + 33, 6, { color: MUTED });

  page.text(labels.slipPayer, right, SLIP_TOP + 66, 6.5, { color: MUTED });
  [customer.name, ...addressLines(customer)].forEach((line, index) =>
    page.text(line, right, SLIP_TOP + 77 + index * 11, 9),
  );

  const boxTop = SLIP_TOP + 140;
  const split = right + 120;
  page.rect(right, boxTop, split - right, 34, { stroke: "000000" });
  page.rect(split, boxTop, edge - split, 34, { stroke: "000000" });
  page.text(labels.slipBankgiroBox, right + 4, boxTop + 3, 6.5, {
    color: MUTED,
  });
  page.text(issuer.bankgiro, right + 4, boxTop + 15, 12, { bold: true });
  page.text(labels.slipPayee, split + 4, boxTop + 3, 6.5, { color: MUTED });
  page.text(issuer.legalName, split + 4, boxTop + 16, 10, { bold: true });

  const noticeTop = CODE_BASELINE - CODE_FONT_SIZE - 40;
  page.text(labels.slipNoChanges, left, noticeTop, 6.5, { bold: true });
  page.text(labels.slipNoMessages, 0, noticeTop, 6.5, {
    bold: true,
    align: "center",
    width: WIDTH,
  });
  page.text(labels.slipMachineRead, right, noticeTop, 6.5, {
    bold: true,
    align: "right",
    width: edge - right,
  });

  // The line is 83 characters at 0.1 inch, a little wider than A4, so it
  // starts at the left edge, where only blanks run off the right side.
  const codeLeft = 0;
  const column = (index: number) => codeLeft + index * CODE_PITCH;
  const labelTop = CODE_BASELINE - CODE_FONT_SIZE - 14;
  const firstDigit = (from: number) => {
    const offset = codeLine.slice(from).search(/\d/);
    return offset < 0 ? from : from + offset;
  };
  // Over the reference, kronor and öre, as on Bankgirot's slips.
  page.text(labels.slipReference, column(firstDigit(5)), labelTop, 6, {
    color: MUTED,
  });
  const kronorStart = firstDigit(codeLine.indexOf("#", 5) + 1);
  page.text(labels.slipKronor, column(kronorStart), labelTop, 6, {
    color: MUTED,
  });
  page.text(labels.slipOre, column(42), labelTop, 6, { color: MUTED });
  page.text(
    codeLine,
    codeLeft,
    CODE_BASELINE - CODE_FONT_SIZE,
    CODE_FONT_SIZE,
    {
      mono: true,
    },
  );
}
/** The file name customers see, for example "Faktura 20.pdf". */
export function invoiceFileName(title: string, invoiceNumber: string) {
  const safe = invoiceNumber.replace(/[^\p{L}\p{N}._-]+/gu, "-");
  return `${title} ${safe}.pdf`;
}
