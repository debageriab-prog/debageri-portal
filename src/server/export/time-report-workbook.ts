import {
  CLOSED_COLOR,
  MISSING_COLOR,
  MONTH_COLORS,
  MUTED_TEXT_COLOR,
  TOTAL_COLOR,
  type ExportSheet,
} from "@/domain/reports/time-report-export";
import { escapeXml, xlsxPackage } from "./xlsx-package";

export { XLSX_CONTENT_TYPE } from "./xlsx-package";

/**
 * Writes the time report as an .xlsx file: a zip of SpreadsheetML parts with
 * fixed styles, which is all this layout needs.
 */

export type WorkbookLabels = {
  dayOfMonth: string;
  total: string;
  totalPossible: string;
  /** January to December in the reader's language. */
  monthNames: readonly string[];
};

const STYLE = {
  label: 1,
  workday: 2,
  closed: 3,
  missing: 4,
  total: 5,
  possibleLabel: 6,
  possible: 7,
  month: 8,
} as const;

const fill = (rgb: string) =>
  `<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;

const centered = '<alignment horizontal="center" vertical="center"/>';
const xf = (font: number, fillId: number, border: number) =>
  `<xf numFmtId="0" fontId="${font}" fillId="${fillId}" borderId="${border}" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${centered}</xf>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><sz val="11"/><color rgb="FF${MUTED_TEXT_COLOR}"/><name val="Calibri"/></font></fonts>
<fills count="${5 + MONTH_COLORS.length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fill(CLOSED_COLOR)}${fill(MISSING_COLOR)}${fill(TOTAL_COLOR)}${MONTH_COLORS.map(fill).join("")}</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${8 + MONTH_COLORS.length}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>${xf(1, 0, 1)}${xf(0, 0, 1)}${xf(0, 2, 1)}${xf(0, 3, 1)}${xf(1, 4, 1)}${xf(2, 0, 0)}${xf(2, 0, 0)}${MONTH_COLORS.map((_, index) => xf(1, 5 + index, 1)).join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const column = (index: number) => String.fromCharCode(65 + index);
const hours = (minutes: number) =>
  String(Math.round((minutes / 60) * 100) / 100);
const text = (ref: string, style: number, value: string) =>
  `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
const number = (ref: string, style: number, minutes: number) =>
  `<c r="${ref}" s="${style}"><v>${hours(minutes)}</v></c>`;
const empty = (ref: string, style: number) => `<c r="${ref}" s="${style}"/>`;

const FIRST_DAY_ROW = 2;
const LAST_DAY_ROW = 32;
const TOTAL_ROW = 34;
const POSSIBLE_ROW = 35;

function worksheet(sheet: ExportSheet, labels: WorkbookLabels, first: boolean) {
  const last = column(sheet.months.length);
  const rows: string[] = [];
  rows.push(
    `<row r="1">${text("A1", STYLE.label, labels.dayOfMonth)}${sheet.months
      .map((month, index) =>
        text(
          `${column(index + 1)}1`,
          STYLE.month + month - 1,
          labels.monthNames[month - 1] ?? String(month),
        ),
      )
      .join("")}</row>`,
  );
  sheet.days.forEach((days, dayIndex) => {
    const row = FIRST_DAY_ROW + dayIndex;
    const cells = days.map((day, index) => {
      const ref = `${column(index + 1)}${row}`;
      if (day.kind === "missing") return empty(ref, STYLE.missing);
      const style = day.kind === "closed" ? STYLE.closed : STYLE.workday;
      return day.minutes === null
        ? empty(ref, style)
        : number(ref, style, day.minutes);
    });
    rows.push(
      `<row r="${row}"><c r="A${row}" s="${STYLE.label}"><v>${dayIndex + 1}</v></c>${cells.join("")}</row>`,
    );
  });
  rows.push(
    `<row r="${TOTAL_ROW}">${text(`A${TOTAL_ROW}`, STYLE.label, labels.total)}${sheet.totalMinutes
      .map((minutes, index) => {
        const letter = column(index + 1);
        return `<c r="${letter}${TOTAL_ROW}" s="${STYLE.total}"><f>SUM(${letter}${FIRST_DAY_ROW}:${letter}${LAST_DAY_ROW})</f><v>${hours(minutes)}</v></c>`;
      })
      .join("")}</row>`,
    `<row r="${POSSIBLE_ROW}">${text(`A${POSSIBLE_ROW}`, STYLE.possibleLabel, labels.totalPossible)}${sheet.possibleMinutes
      .map((minutes, index) =>
        number(`${column(index + 1)}${POSSIBLE_ROW}`, STYLE.possible, minutes),
      )
      .join("")}</row>`,
  );
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${last}${POSSIBLE_ROW}"/>
<sheetViews><sheetView workbookViewId="0"${first ? ' tabSelected="1"' : ""}><pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols><col min="1" max="1" width="18" customWidth="1"/><col min="2" max="${sheet.months.length + 1}" width="13" customWidth="1"/></cols>
<sheetData>${rows.join("")}</sheetData>
</worksheet>`;
}

export function timeReportWorkbook(
  sheets: readonly ExportSheet[],
  labels: WorkbookLabels,
): Buffer {
  return xlsxPackage(
    sheets.map((sheet, index) => ({
      name: sheet.name,
      xml: worksheet(sheet, labels, index === 0),
    })),
    STYLES,
  );
}
