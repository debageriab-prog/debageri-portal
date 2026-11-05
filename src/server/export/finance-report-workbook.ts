import type { FinanceReport, ReportRow } from "@/domain/finance/report-export";
import { MONTH_COLORS } from "@/domain/reports/time-report-export";
import { escapeXml, xlsxPackage } from "./xlsx-package";

/**
 * Writes a finance report as one worksheet: row labels down the side, an
 * optional Total column and then the months, amounts in kronor.
 */

export type FinanceReportHeader = {
  title: string;
  total: string;
  sheetName: string;
  /** January to December in the reader's language. */
  monthNames: readonly string[];
};

export const FINANCE_REPORT_COLORS = {
  incomeSeparator: "B6D7A8",
  expenseSeparator: "E6E6E6",
  result: "B6D7A8",
  totalColumn: "F3F3F3",
  info: "999999",
  share: "3B6F9C",
  totalExpenses: "CC4125",
} as const;

const C = FINANCE_REPORT_COLORS;
const fill = (rgb: string) =>
  `<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
const font = (bold: boolean, color?: string) =>
  `<font>${bold ? "<b/>" : ""}<sz val="11"/>${color ? `<color rgb="FF${color}"/>` : ""}<name val="Calibri"/></font>`;
const side = (name: string, color: string) =>
  `<${name} style="thin"><color rgb="FF${color}"/></${name}>`;
const border = (color: string) =>
  `<border>${["left", "right", "top", "bottom"].map((name) => side(name, color)).join("")}<diagonal/></border>`;
const MONEY_FORMAT = 164;
const xf = (
  fontId: number,
  fillId: number,
  borderId: number,
  horizontal: "left" | "center" | "right",
  numFmtId = 0,
) =>
  `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${horizontal}" vertical="center"/></xf>`;

// Fonts: 0 normal, 1 bold, 2 info grey, 3 bold share blue, 4 bold red.
// Fills: 2 income separator, 3 expense separator, 4 result, 5 total column,
// then one per month. Borders: 1 light grid, 2 dark outline.
const STYLE = {
  header: 1,
  label: 2,
  money: 3,
  infoLabel: 4,
  infoMoney: 5,
  infoNumber: 6,
  shareLabel: 7,
  shareMoney: 8,
  incomeSeparator: 9,
  expenseSeparator: 10,
  totalExpensesLabel: 11,
  totalExpensesMoney: 12,
  resultLabel: 13,
  resultMoney: 14,
  boldLabel: 15,
  boldMoney: 16,
  totalHeader: 17,
  month: 18,
} as const;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="${MONEY_FORMAT}" formatCode="#,##0;-#,##0"/></numFmts>
<fonts count="5">${font(false)}${font(true)}${font(false, C.info)}${font(true, C.share)}${font(true, C.totalExpenses)}</fonts>
<fills count="${6 + MONTH_COLORS.length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fill(C.incomeSeparator)}${fill(C.expenseSeparator)}${fill(C.result)}${fill(C.totalColumn)}${MONTH_COLORS.map(fill).join("")}</fills>
<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>${border("D9D9D9")}${border("000000")}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${STYLE.month + MONTH_COLORS.length}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>${[
  xf(1, 0, 1, "left"),
  xf(1, 0, 1, "left"),
  xf(0, 0, 1, "right", MONEY_FORMAT),
  xf(2, 0, 1, "left"),
  xf(2, 0, 1, "right", MONEY_FORMAT),
  xf(2, 0, 1, "right"),
  xf(1, 0, 1, "left"),
  xf(3, 0, 1, "right", MONEY_FORMAT),
  xf(1, 2, 1, "left"),
  xf(1, 3, 1, "left"),
  xf(1, 0, 1, "left"),
  xf(4, 0, 1, "right", MONEY_FORMAT),
  xf(1, 4, 2, "left"),
  xf(1, 4, 2, "right", MONEY_FORMAT),
  xf(1, 0, 1, "left"),
  xf(1, 0, 1, "right", MONEY_FORMAT),
  xf(1, 5, 1, "center"),
  ...MONTH_COLORS.map((_, index) => xf(1, 6 + index, 1, "center")),
].join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function rowStyles(row: Extract<ReportRow, { kind: "values" }>) {
  if (row.style === "info")
    return {
      label: STYLE.infoLabel,
      value: row.unit === "money" ? STYLE.infoMoney : STYLE.infoNumber,
    };
  if (row.style === "share")
    return { label: STYLE.shareLabel, value: STYLE.shareMoney };
  if (row.style === "totalExpenses")
    return { label: STYLE.totalExpensesLabel, value: STYLE.totalExpensesMoney };
  if (row.style === "result")
    return { label: STYLE.resultLabel, value: STYLE.resultMoney };
  if (row.style === "balance" || row.style === "subtotal")
    return { label: STYLE.boldLabel, value: STYLE.boldMoney };
  return { label: STYLE.label, value: STYLE.money };
}

/** Column letters for up to 26 columns, which is plenty here. */
const column = (index: number) => String.fromCharCode(65 + index);
const xlsxValue = (value: number, unit: string) =>
  String(unit === "money" ? value / 100 : Math.round(value * 100) / 100);

export function financeReportWorkbook(
  report: FinanceReport,
  header: FinanceReportHeader,
): Buffer {
  const firstMonth = report.showTotal ? 2 : 1;
  const lastColumn = column(firstMonth + report.months.length - 1);
  const text = (ref: string, style: number, value: string) =>
    `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
  const rows = [
    `<row r="1">${text("A1", STYLE.header, header.title)}${
      report.showTotal ? text("B1", STYLE.totalHeader, header.total) : ""
    }${report.months
      .map((month, index) =>
        text(
          `${column(firstMonth + index)}1`,
          STYLE.month + month - 1,
          header.monthNames[month - 1] ?? String(month),
        ),
      )
      .join("")}</row>`,
  ];
  report.rows.forEach((row, index) => {
    const r = index + 2;
    const cells: string[] = [];
    const columns = firstMonth + report.months.length;
    if (row.kind === "separator") {
      const style =
        row.tone === "income" ? STYLE.incomeSeparator : STYLE.expenseSeparator;
      cells.push(
        row.label
          ? text(`A${r}`, style, row.label)
          : `<c r="A${r}" s="${style}"/>`,
      );
      for (let col = 1; col < columns; col += 1)
        cells.push(`<c r="${column(col)}${r}" s="${style}"/>`);
    } else {
      const styles = rowStyles(row);
      cells.push(text(`A${r}`, styles.label, row.label));
      const cell = (col: number, value: number | null, formula = "") => {
        const ref = `${column(col)}${r}`;
        if (value === null) return `<c r="${ref}" s="${styles.value}"/>`;
        return `<c r="${ref}" s="${styles.value}">${formula ? `<f>${formula}</f>` : ""}<v>${xlsxValue(value, row.unit)}</v></c>`;
      };
      if (report.showTotal) {
        // Flows add up across the months; balances and rates do not.
        const sums = row.style !== "balance" && row.unit !== "rate";
        cells.push(
          cell(
            1,
            row.total,
            sums && row.total !== null
              ? `SUM(${column(firstMonth)}${r}:${lastColumn}${r})`
              : "",
          ),
        );
      }
      row.values.forEach((value, monthIndex) =>
        cells.push(cell(firstMonth + monthIndex, value)),
      );
    }
    rows.push(`<row r="${r}">${cells.join("")}</row>`);
  });
  const lastRow = report.rows.length + 1;
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${lastColumn}${lastRow}"/>
<sheetViews><sheetView workbookViewId="0" tabSelected="1"><pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols><col min="1" max="1" width="36" customWidth="1"/><col min="2" max="${firstMonth + report.months.length}" width="13" customWidth="1"/></cols>
<sheetData>${rows.join("")}</sheetData>
</worksheet>`;
  return xlsxPackage([{ name: header.sheetName, xml }], STYLES);
}
