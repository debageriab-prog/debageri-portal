import type { FinanceReport, ReportRow } from "@/domain/finance/report-export";
import { MONTH_COLORS } from "@/domain/reports/time-report-export";
import {
  FINANCE_REPORT_COLORS as C,
  type FinanceReportHeader,
} from "./finance-report-workbook";
import { pdfDocument, PdfPage, type CellOptions } from "./pdf-document";

/**
 * Prints a finance report on one page like the worksheet. A year goes on
 * landscape A4 so the Total column and all twelve months fit.
 */

/** Kronor without decimals, with signs and spaces the standard fonts have. */
export function pdfAmount(minor: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
    .format(Math.round(minor / 100))
    .replace(/−/g, "-")
    .replace(/[  ]/g, " ");
}

const pdfQuantity = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
    .format(value)
    .replace(/−/g, "-")
    .replace(/[  ]/g, " ");

function rowOptions(row: Extract<ReportRow, { kind: "values" }>) {
  const base = { border: true };
  const label: CellOptions = { ...base, bold: true, align: "left" };
  const value: CellOptions = { ...base, align: "right" };
  if (row.style === "info")
    return {
      label: { ...label, bold: false, color: C.info },
      value: { ...value, color: C.info },
    };
  if (row.style === "share")
    return { label, value: { ...value, bold: true, color: C.share } };
  if (row.style === "totalExpenses")
    return { label, value: { ...value, bold: true, color: C.totalExpenses } };
  if (row.style === "result")
    return {
      label: { ...label, fill: C.result },
      value: { ...value, bold: true, fill: C.result },
    };
  if (row.style === "balance" || row.style === "subtotal")
    return { label, value: { ...value, bold: true } };
  return { label, value };
}

export function financeReportPdf(
  report: FinanceReport,
  header: FinanceReportHeader & { subtitle: string },
  locale: string,
): Buffer {
  const columns = report.months.length + (report.showTotal ? 1 : 0);
  const landscape = columns > 2;
  const width = landscape ? 842 : 595;
  const height = landscape ? 595 : 842;
  const margin = landscape ? 28 : 40;
  const titleHeight = 46;
  const rowCount = report.rows.length + 1;
  const rowHeight = Math.min(
    20,
    (height - 2 * margin - titleHeight) / rowCount,
  );
  const fontSize = Math.min(9.5, rowHeight * 0.55);
  const labelWidth = landscape ? 150 : 240;
  const columnWidth = Math.min(
    120,
    (width - 2 * margin - labelWidth) / Math.max(columns, 1),
  );
  const page = new PdfPage(width, height);
  page.text(header.title, margin, margin, 13, { bold: true });
  page.text(header.subtitle, margin, margin + 20, 10, { color: "555555" });

  const tableTop = margin + titleHeight;
  const x = (column: number) => margin + labelWidth + column * columnWidth;
  const cell = (
    left: number,
    row: number,
    cellWidth: number,
    value: string,
    options: CellOptions,
  ) =>
    page.cell(
      left,
      tableTop + row * rowHeight,
      cellWidth,
      rowHeight,
      value,
      fontSize,
      { color: "000000", ...options },
    );

  cell(margin, 0, labelWidth, "", { border: true });
  const firstMonth = report.showTotal ? 1 : 0;
  if (report.showTotal)
    cell(x(0), 0, columnWidth, header.total, {
      bold: true,
      fill: C.totalColumn,
    });
  report.months.forEach((month, index) =>
    cell(
      x(firstMonth + index),
      0,
      columnWidth,
      header.monthNames[month - 1] ?? String(month),
      { bold: true, fill: MONTH_COLORS[month - 1] },
    ),
  );
  const format = (value: number | null, unit: string) =>
    value === null
      ? ""
      : unit === "money"
        ? pdfAmount(value, locale)
        : pdfQuantity(value, locale);
  report.rows.forEach((row, index) => {
    const r = index + 1;
    if (row.kind === "separator") {
      const fill =
        row.tone === "income" ? C.incomeSeparator : C.expenseSeparator;
      cell(margin, r, labelWidth + columns * columnWidth, row.label ?? "", {
        fill,
        bold: true,
        align: "left",
      });
      return;
    }
    const options = rowOptions(row);
    cell(margin, r, labelWidth, row.label, options.label);
    if (report.showTotal)
      cell(x(0), r, columnWidth, format(row.total, row.unit), {
        ...options.value,
        fill: options.value.fill ?? C.totalColumn,
      });
    row.values.forEach((value, monthIndex) =>
      cell(
        x(firstMonth + monthIndex),
        r,
        columnWidth,
        format(value, row.unit),
        options.value,
      ),
    );
  });
  return pdfDocument([page]);
}
