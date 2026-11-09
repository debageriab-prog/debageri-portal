import { lineAmountMinor } from "@/domain/salary/articles";
import type { SalarySlip } from "@/domain/salary/slip";
import { pdfDocument, PdfPage } from "./pdf-document";

export { PDF_CONTENT_TYPE } from "./pdf-document";

/**
 * A Swedish payslip (lönespecifikation) as an A4 PDF: a summary box with the
 * payout and the person's details, the address, the events (händelser) with
 * tax and rounding, the payout, what is reported to Skatteverket, and the
 * vacation balance.
 */

export type SalarySlipPdfLabels = Record<
  | "title"
  | "yourSalary"
  | "paymentDate"
  | "salaryPeriod"
  | "taxTable"
  | "personalNumber"
  | "employeeNumber"
  | "events"
  | "name"
  | "from"
  | "to"
  | "scope"
  | "quantity"
  | "price"
  | "amount"
  | "tax"
  | "oneTimeTax"
  | "taxTableLine"
  | "taxAdjusted"
  | "rounding"
  | "reported"
  | "grossMonth"
  | "benefitsMonth"
  | "taxMonth"
  | "grossYear"
  | "benefitsYear"
  | "taxYear"
  | "balance"
  | "paidVacation"
  | "savedVacation"
  | "salaryAccount",
  string
>;

export interface SalarySlipPdfInput {
  slip: Pick<
    SalarySlip,
    | "period"
    | "paymentDate"
    | "person"
    | "tax"
    | "lines"
    | "totals"
    | "yearToDate"
    | "vacation"
  >;
  /** Each line's name as printed, with its description, by line id. */
  lineNames: Record<string, string>;
  employer: { name: string; orgNumber: string };
  labels: SalarySlipPdfLabels;
}

const WIDTH = 595;
const HEIGHT = 842;
const MARGIN = 40;
const ACCENT = "C9A227";
const BOX = "F2F2F2";
const MUTED = "555555";

/** `44 600,00` from öre; Swedish digit grouping with a decimal comma. */
export function formatAmount(minor: number, decimals = 2) {
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(minor / 100);
}

/** Whole kronor as reported to Skatteverket: the öre are dropped. */
export function formatKronor(minor: number) {
  return formatAmount(Math.trunc(minor / 100) * 100, 0);
}

/** `0801` from `2026-08-01`, as payslips show dates. */
function shortDate(date: string | null) {
  return date ? `${date.slice(5, 7)}${date.slice(8, 10)}` : "";
}

function lastDay(period: string) {
  const [year, month] = period.split("-").map(Number) as [number, number];
  return `${period}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
}

/** Label and value rows, the value right-aligned at `right`. */
function pairs(
  page: PdfPage,
  rows: Array<[string, string]>,
  x: number,
  top: number,
  right: number,
  size: number,
  gap: number,
  bold = false,
) {
  rows.forEach(([label, value], index) => {
    const y = top + index * gap;
    page.text(label, x, y, size, { bold });
    page.text(value, x, y, size, {
      bold: true,
      align: "right",
      width: right - x,
    });
  });
}

function sectionHeading(page: PdfPage, text: string, top: number) {
  page.text(text.toUpperCase(), MARGIN, top, 10, { bold: true });
  page.line(MARGIN, top + 14, WIDTH - MARGIN, top + 14, {
    color: ACCENT,
    width: 1.2,
  });
}

export function salarySlipPdf(input: SalarySlipPdfInput): Buffer {
  const { slip, labels, employer } = input;
  const page = new PdfPage(WIDTH, HEIGHT);
  const right = WIDTH - MARGIN;
  const salary = `${formatAmount(slip.totals.netMinor, 0)} SEK`;

  page.text(employer.name, MARGIN, MARGIN, 11, { bold: true });
  if (employer.orgNumber)
    page.text(employer.orgNumber, MARGIN, MARGIN + 14, 8, { color: MUTED });
  page.text(labels.title, MARGIN, MARGIN - 4, 18, {
    bold: true,
    align: "right",
    width: right - MARGIN,
  });

  // Summary box on the left, the person's address on the right.
  const boxTop = 96;
  page.rect(MARGIN, boxTop, 270, 100, { fill: BOX });
  const taxText =
    slip.tax.overrideMinor !== null || slip.tax.adjustment.type !== "none"
      ? labels.taxAdjusted
      : String(slip.tax.table ?? "");
  pairs(
    page,
    [
      [labels.yourSalary, salary],
      [labels.paymentDate, slip.paymentDate],
      [labels.salaryPeriod, `${slip.period}-01 - ${lastDay(slip.period)}`],
      [labels.taxTable, taxText],
      [labels.personalNumber, slip.person.personalNumber],
      [labels.employeeNumber, slip.person.employeeNumber],
    ],
    MARGIN + 12,
    boxTop + 12,
    MARGIN + 258,
    9,
    13,
  );
  const addressX = 340;
  [
    slip.person.displayName,
    slip.person.addressLine,
    `${slip.person.postalCode} ${slip.person.city}`.trim(),
  ]
    .filter(Boolean)
    .forEach((line, index) =>
      page.text(line, addressX, boxTop + 12 + index * 14, 10, { bold: true }),
    );

  // Events.
  let top = 230;
  sectionHeading(page, labels.events, top);
  const columns = [
    { label: labels.name, x: MARGIN, width: 190, align: "left" as const },
    { label: labels.from, x: 230, width: 40, align: "left" as const },
    { label: labels.to, x: 272, width: 40, align: "left" as const },
    { label: labels.scope, x: 312, width: 52, align: "right" as const },
    { label: labels.quantity, x: 366, width: 50, align: "right" as const },
    { label: labels.price, x: 418, width: 66, align: "right" as const },
    {
      label: labels.amount,
      x: 486,
      width: right - 486,
      align: "right" as const,
    },
  ];
  top += 18;
  for (const column of columns)
    page.text(column.label.toUpperCase(), column.x, top, 7.5, {
      bold: true,
      align: column.align,
      width: column.width,
    });
  top += 12;
  page.line(MARGIN, top, right, top, { color: ACCENT, width: 1.2 });
  const row = (values: string[]) => {
    values.forEach((value, index) => {
      const column = columns[index]!;
      if (value)
        page.text(value, column.x, top + 4, 8.5, {
          align: column.align,
          width: column.width,
        });
    });
    top += 16;
    page.line(MARGIN, top, right, top, { color: "DDDDDD" });
  };
  for (const line of slip.lines)
    row([
      input.lineNames[line.id] || line.label || line.article,
      shortDate(line.from),
      shortDate(line.to),
      formatAmount(line.scopeBps),
      formatAmount(line.quantityHundredths),
      formatAmount(line.unitPriceMinor),
      formatAmount(lineAmountMinor(line)),
    ]);
  const oneTimeTax = slip.totals.oneTimeTaxMinor ?? 0;
  // Extra tax is its own line among the events above.
  const extraTax = slip.totals.extraTaxMinor ?? 0;
  row([
    slip.tax.overrideMinor !== null || slip.tax.adjustment.type !== "none"
      ? labels.tax
      : labels.taxTableLine,
    "",
    "",
    "",
    "",
    "",
    formatAmount(-(slip.totals.taxMinor - oneTimeTax - extraTax)),
  ]);
  if (oneTimeTax)
    row([
      labels.oneTimeTax.replace(
        "{percent}",
        String(slip.totals.oneTimePercent ?? 0),
      ),
      "",
      "",
      "",
      "",
      "",
      formatAmount(-oneTimeTax),
    ]);
  if (slip.totals.roundingMinor)
    row([
      labels.rounding,
      "",
      "",
      "",
      "",
      "",
      formatAmount(slip.totals.roundingMinor),
    ]);

  // Payout.
  top += 30;
  const payoutLabel = labels.yourSalary.toUpperCase();
  page.text(payoutLabel, 360, top, 13, { bold: true });
  page.text(salary, 360, top, 13, {
    bold: true,
    align: "right",
    width: right - 360,
  });
  if (slip.person.bankAccount)
    page.text(
      `${labels.salaryAccount}: ${slip.person.bankClearing} ${slip.person.bankAccount}`.trim(),
      360,
      top + 18,
      8,
      { color: MUTED },
    );

  // Reported to Skatteverket.
  top += 50;
  sectionHeading(page, labels.reported, top);
  top += 22;
  pairs(
    page,
    [
      [labels.grossMonth, formatKronor(slip.totals.grossMinor)],
      [labels.benefitsMonth, formatKronor(slip.totals.benefitsMinor)],
      [labels.taxMonth, formatKronor(slip.totals.taxMinor)],
    ],
    MARGIN,
    top,
    240,
    9,
    13,
  );
  const year = slip.yearToDate;
  pairs(
    page,
    [
      [
        labels.grossYear,
        formatKronor(year.grossMinor + slip.totals.grossMinor),
      ],
      [
        labels.benefitsYear,
        formatKronor(year.benefitsMinor + slip.totals.benefitsMinor),
      ],
      [labels.taxYear, formatKronor(year.taxMinor + slip.totals.taxMinor)],
    ],
    340,
    top,
    right,
    9,
    13,
  );

  if (slip.vacation) {
    top += 60;
    sectionHeading(page, labels.balance, top);
    top += 22;
    pairs(
      page,
      [
        [labels.paidVacation, formatAmount(slip.vacation.paidDays * 100)],
        [labels.savedVacation, formatAmount(slip.vacation.savedDays * 100)],
      ],
      MARGIN,
      top,
      240,
      9,
      13,
    );
  }
  return pdfDocument([page]);
}

/** `Lönespecifikation 2026-08 Anna Andersson.pdf` */
export function salarySlipFileName(
  title: string,
  period: string,
  name: string,
) {
  const safe = `${title} ${period} ${name}`
    .replace(/[\\/:*?"<>|\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${safe}.pdf`;
}
