import { deflateSync } from "node:zlib";
import {
  CLOSED_COLOR,
  MISSING_COLOR,
  MONTH_COLORS,
  MUTED_TEXT_COLOR,
  TOTAL_COLOR,
  type ExportSheet,
} from "@/domain/reports/time-report-export";
import type { WorkbookLabels } from "./time-report-workbook";

/**
 * Writes the time report as a PDF with one page per time code, laid out like
 * the Excel tabs. A year is printed landscape so all twelve months fit.
 */

export const PDF_CONTENT_TYPE = "application/pdf";

/** Helvetica advance widths for character codes 32 to 126, in 1/1000 em. */
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];

/** Keeps what the standard fonts can show (Latin-1) and swaps the rest. */
export function pdfText(value: string) {
  return [...value.normalize("NFC")]
    .map((char) => {
      const code = char.codePointAt(0)!;
      return (code >= 32 && code <= 126) || (code >= 160 && code <= 255)
        ? char
        : "?";
    })
    .join("");
}

function charWidth(char: string) {
  const code = char.charCodeAt(0);
  if (code >= 32 && code <= 126) return HELVETICA_WIDTHS[code - 32]!;
  const base = char.normalize("NFD").charCodeAt(0);
  return base >= 32 && base <= 126 ? HELVETICA_WIDTHS[base - 32]! : 556;
}

export function textWidth(value: string, size: number, bold = false) {
  const width = [...value].reduce((sum, char) => sum + charWidth(char), 0);
  return (width * size * (bold ? 1.05 : 1)) / 1000;
}

const escape = (value: string) => value.replace(/([\\()])/g, "\\$1");
const rgb = (hex: string) =>
  [0, 2, 4]
    .map((start) =>
      (parseInt(hex.slice(start, start + 2), 16) / 255).toFixed(3),
    )
    .join(" ");
const num = (value: number) => String(Math.round(value * 100) / 100);
const hours = (minutes: number) => num(minutes / 60);

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
  const { height, margin, labelWidth, columnWidth, rowHeight, fontSize } =
    layout;
  const ops: string[] = ["0.5 w 0 0 0 RG"];
  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    { bold = false, color = "000000", align = "left", width = 0 } = {},
  ) => {
    const clean = pdfText(value);
    const offset =
      align === "center" ? (width - textWidth(clean, size, bold)) / 2 : 0;
    ops.push(
      `BT /${bold ? "F2" : "F1"} ${num(size)} Tf ${rgb(color)} rg ${num(x + offset)} ${num(y)} Td (${escape(clean)}) Tj ET`,
    );
  };
  const cell = (
    x: number,
    top: number,
    width: number,
    value: string,
    { fill, bold = false, border = true, color = "000000" } = {} as {
      fill?: string;
      bold?: boolean;
      border?: boolean;
      color?: string;
    },
  ) => {
    const y = height - top - rowHeight;
    if (fill)
      ops.push(
        `${rgb(fill)} rg ${num(x)} ${num(y)} ${num(width)} ${num(rowHeight)} re f`,
      );
    if (border)
      ops.push(`${num(x)} ${num(y)} ${num(width)} ${num(rowHeight)} re S`);
    if (value)
      text(value, x, y + (rowHeight - fontSize * 0.7) / 2, fontSize, {
        bold,
        color,
        align: "center",
        width,
      });
  };

  text(title, margin, height - margin - 13, 13, { bold: true });
  text(sheet.name, margin, height - margin - 30, 10, { color: "555555" });
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
  return ops.join("\n");
}

export function timeReportPdf(
  sheets: readonly ExportSheet[],
  labels: WorkbookLabels,
  title: string,
): Buffer {
  const objects: Buffer[] = [];
  const add = (body: Buffer | string) =>
    objects.push(typeof body === "string" ? Buffer.from(body, "latin1") : body);
  const pageIds = sheets.map((_, index) => 5 + index * 2);
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${sheets.length} >>`,
  );
  add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );
  sheets.forEach((sheet, index) => {
    const layout = layoutFor(sheet.months.length);
    const content = deflateSync(
      Buffer.from(page(sheet, labels, title, layout), "latin1"),
    );
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${layout.width} ${layout.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[index]! + 1} 0 R >>`,
    );
    add(
      Buffer.concat([
        Buffer.from(
          `<< /Length ${content.length} /Filter /FlateDecode >>\nstream\n`,
          "latin1",
        ),
        content,
        Buffer.from("\nendstream", "latin1"),
      ]),
    );
  });

  const parts: Buffer[] = [
    Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1"),
  ];
  let offset = parts[0]!.length;
  const offsets = objects.map((body, index) => {
    const start = offset;
    const chunk = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, "latin1"),
      body,
      Buffer.from("\nendobj\n", "latin1"),
    ]);
    parts.push(chunk);
    offset += chunk.length;
    return start;
  });
  const xref = [
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`,
    ...offsets.map((start) => `${String(start).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`,
  ].join("");
  parts.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(parts);
}
