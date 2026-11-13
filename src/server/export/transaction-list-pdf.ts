import { pdfDocument, PdfPage, pdfText, textWidth } from "./pdf-document";

/**
 * Income and expenses as a landscape A4 table: a title, what the view was
 * filtered on, a block of totals, then every row, with the column headings
 * repeated on each page and page numbers at the foot.
 */

export type TransactionListPdf = {
  title: string;
  /** One line each, such as the period, who is shown and the search. */
  details: string[];
  totals: Array<{ label: string; value: string }>;
  columns: Array<{ label: string; align: "left" | "right"; width: number }>;
  rows: string[][];
  /** For example "Page {page} of {pages}". */
  pageLabel: string;
  /** Shown instead of the table when there are no rows. */
  emptyLabel: string;
};

const WIDTH = 842;
const HEIGHT = 595;
const MARGIN = 28;
const ROW_HEIGHT = 15;
const FONT_SIZE = 7.5;
const HEADER_FILL = "ece3d6";
const STRIPE_FILL = "f8f4ee";
const TOTAL_FILL = "f4ede3";
const MUTED = "5f5348";

/** Shortens text with an ellipsis until it fits the width. */
function fit(value: string, width: number, size: number, bold = false) {
  const clean = pdfText(value.replace(/\s+/g, " ").trim());
  if (textWidth(clean, size, bold) <= width) return clean;
  let end = clean.length;
  while (end > 0 && textWidth(`${clean.slice(0, end)}...`, size, bold) > width)
    end -= 1;
  return `${clean.slice(0, end).trimEnd()}...`;
}

export function transactionListPdf(document: TransactionListPdf): Buffer {
  const tableWidth = WIDTH - 2 * MARGIN;
  const weight = document.columns.reduce(
    (sum, column) => sum + column.width,
    0,
  );
  const widths = document.columns.map(
    (column) => (column.width / Math.max(weight, 1)) * tableWidth,
  );
  const pages: PdfPage[] = [];
  let page = new PdfPage(WIDTH, HEIGHT);
  pages.push(page);

  // Title and filters.
  let top = MARGIN;
  page.text(document.title, MARGIN, top, 15, { bold: true });
  top += 22;
  for (const line of document.details) {
    page.text(fit(line, tableWidth, 9), MARGIN, top, 9, { color: MUTED });
    top += 13;
  }
  top += 6;

  // Totals, four to a row.
  const perRow = 4;
  const gap = 8;
  const boxWidth = (tableWidth - gap * (perRow - 1)) / perRow;
  const boxHeight = 32;
  document.totals.forEach((total, index) => {
    const x = MARGIN + (index % perRow) * (boxWidth + gap);
    const y = top + Math.floor(index / perRow) * (boxHeight + gap);
    page.rect(x, y, boxWidth, boxHeight, {
      fill: TOTAL_FILL,
      stroke: "d8cbb9",
    });
    page.text(fit(total.label, boxWidth - 12, 7.5), x + 6, y + 5, 7.5, {
      color: MUTED,
    });
    page.text(fit(total.value, boxWidth - 12, 10, true), x + 6, y + 16, 10, {
      bold: true,
    });
  });
  top +=
    Math.ceil(document.totals.length / perRow) * (boxHeight + gap) +
    (document.totals.length ? 8 : 0);

  const header = () => {
    let x = MARGIN;
    document.columns.forEach((column, index) => {
      const width = widths[index]!;
      page.cell(x, top, width, ROW_HEIGHT, "", FONT_SIZE, {
        fill: HEADER_FILL,
        border: false,
      });
      page.text(
        fit(column.label, width - 8, FONT_SIZE, true),
        x + 4,
        top + 4,
        FONT_SIZE,
        { bold: true, align: column.align, width: width - 8 },
      );
      x += width;
    });
    top += ROW_HEIGHT;
  };

  if (!document.rows.length)
    page.text(document.emptyLabel, MARGIN, top + 4, 10, { color: MUTED });
  else header();

  document.rows.forEach((row, rowIndex) => {
    if (top + ROW_HEIGHT > HEIGHT - MARGIN - 14) {
      page = new PdfPage(WIDTH, HEIGHT);
      pages.push(page);
      top = MARGIN;
      header();
    }
    if (rowIndex % 2 === 1)
      page.rect(MARGIN, top, tableWidth, ROW_HEIGHT, { fill: STRIPE_FILL });
    let x = MARGIN;
    document.columns.forEach((column, index) => {
      const width = widths[index]!;
      page.text(
        fit(row[index] ?? "", width - 8, FONT_SIZE),
        x + 4,
        top + 4,
        FONT_SIZE,
        { align: column.align, width: width - 8 },
      );
      x += width;
    });
    page.line(MARGIN, top + ROW_HEIGHT, MARGIN + tableWidth, top + ROW_HEIGHT, {
      color: "e2d8ca",
      width: 0.4,
    });
    top += ROW_HEIGHT;
  });

  pages.forEach((item, index) =>
    item.text(
      document.pageLabel
        .replace("{page}", String(index + 1))
        .replace("{pages}", String(pages.length)),
      MARGIN,
      HEIGHT - MARGIN,
      7.5,
      { color: MUTED, align: "right", width: tableWidth },
    ),
  );
  return pdfDocument(pages);
}
