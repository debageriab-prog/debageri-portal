import {
  CLOSED_COLOR,
  MISSING_COLOR,
  MONTH_COLORS,
  MUTED_TEXT_COLOR,
  TOTAL_COLOR,
  type ExportSheet,
} from "@/domain/reports/time-report-export";
import {
  pdfDocument,
  pdfNumber,
  PdfPage,
  type CellOptions,
} from "./pdf-document";
import type { WorkbookLabels } from "./time-report-workbook";

/**
 * Writes the time report as a PDF with one page per time code, laid out like
 * the Excel tabs. A year is printed landscape so all twelve months fit.
 */

export { PDF_CONTENT_TYPE, pdfText, textWidth } from "./pdf-document";

const hours = (minutes: number) => pdfNumber(minutes / 60);

type Layout = {
  width: number;
  height: number;
  margin: number;
  labelWidth: number;
  columnWidth: number;
  rowHeight: number;
  fontSize: number;
};

function layoutFor(months: number) {
  const landscape = months > 1;
  const width = landscape ? 842 : 595;
  const height = landscape ? 595 : 842;
  const margin = landscape ? 28 : 40;
  const titleHeight = 44;
  const rowHeight = Math.min(18, (height - 2 * margin - titleHeight) / 35);
  const labelWidth = landscape ? 78 : 110;
  const columnWidth = Math.min(
    110,
    (width - 2 * margin - labelWidth) / Math.max(months, 1),
  );
  return {
    width,
    height,
    margin,
    labelWidth,
    columnWidth,
    rowHeight,
    fontSize: Math.min(10, rowHeight * 0.55),
  } satisfies Layout;
}

function page(
  sheet: ExportSheet,
  labels: WorkbookLabels,
  title: string,
  layout: Layout,
) {
  const { margin, labelWidth, columnWidth, rowHeight, fontSize } = layout;
  const pdf = new PdfPage(layout.width, layout.height);
  const cell = (
    x: number,
    top: number,
    width: number,
    value: string,
    options: CellOptions = {},
  ) => pdf.cell(x, top, width, rowHeight, value, fontSize, options);

  pdf.text(title, margin, margin, 13, { bold: true });
  pdf.text(sheet.name, margin, margin + 20, 10, { color: "555555" });
  const tableTop = margin + 44;
  const columnX = (index: number) => margin + labelWidth + index * columnWidth;
  const rowTop = (row: number) => tableTop + row * rowHeight;

  cell(margin, rowTop(0), labelWidth, labels.dayOfMonth, { bold: true });
  sheet.months.forEach((month, index) =>
    cell(
      columnX(index),
      rowTop(0),
      columnWidth,
      labels.monthNames[month - 1] ?? String(month),
      { fill: MONTH_COLORS[month - 1], bold: true },
    ),
  );
  sheet.days.forEach((days, dayIndex) => {
    const top = rowTop(dayIndex + 1);
    cell(margin, top, labelWidth, String(dayIndex + 1), { bold: true });
    days.forEach((day, index) =>
      cell(
        columnX(index),
        top,
        columnWidth,
        day.kind === "missing" || day.minutes === null
          ? ""
          : hours(day.minutes),
        {
          fill:
            day.kind === "missing"
              ? MISSING_COLOR
              : day.kind === "closed"
                ? CLOSED_COLOR
                : undefined,
        },
      ),
    );
  });
  cell(margin, rowTop(33), labelWidth, labels.total, { bold: true });
  sheet.totalMinutes.forEach((minutes, index) =>
    cell(columnX(index), rowTop(33), columnWidth, hours(minutes), {
      fill: TOTAL_COLOR,
      bold: true,
    }),
  );
  const muted = { border: false, color: MUTED_TEXT_COLOR };
  cell(margin, rowTop(34), labelWidth, labels.totalPossible, muted);
  sheet.possibleMinutes.forEach((minutes, index) =>
    cell(columnX(index), rowTop(34), columnWidth, hours(minutes), muted),
  );
  return pdf;
}

export function timeReportPdf(
  sheets: readonly ExportSheet[],
  labels: WorkbookLabels,
  title: string,
): Buffer {
  return pdfDocument(
    sheets.map((sheet) =>
      page(sheet, labels, title, layoutFor(sheet.months.length)),
    ),
  );
}
