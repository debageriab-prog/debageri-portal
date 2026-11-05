import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  buildExportSheets,
  exportFileName,
  isValidExportPeriod,
  reportVisibleTo,
  sheetNames,
  type ExportEntry,
} from "@/domain/reports/time-report-export";
import {
  crc32,
  timeReportWorkbook,
} from "@/server/export/time-report-workbook";

const worked = (date: string, minutes: number): ExportEntry => ({
  date,
  minutes,
  timeCodeId: "work",
  name: "Development",
  countsAsWorkedTime: true,
});
const vacation = (date: string, minutes: number): ExportEntry => ({
  date,
  minutes,
  timeCodeId: "vac",
  name: "Vacation",
  countsAsWorkedTime: false,
});

/** Reads a zip back through its central directory. */
function unzip(data: Buffer) {
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = data.readUInt16LE(end + 10);
  let cursor = data.readUInt32LE(end + 16);
  const files = new Map<string, string>();
  for (let index = 0; index < count; index += 1) {
    expect(data.readUInt32LE(cursor)).toBe(0x02014b50);
    const crc = data.readUInt32LE(cursor + 16);
    const size = data.readUInt32LE(cursor + 20);
    const nameLength = data.readUInt16LE(cursor + 28);
    const offset = data.readUInt32LE(cursor + 42);
    const name = data.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    const start = offset + 30 + data.readUInt16LE(offset + 26);
    const raw = inflateRawSync(data.subarray(start, start + size));
    expect(crc32(raw)).toBe(crc);
    files.set(name, raw.toString("utf8"));
    cursor += 46 + nameLength;
  }
  return files;
}

describe("buildExportSheets", () => {
  it("makes one tab per reported time code, worked time first", () => {
    const sheets = buildExportSheets(
      [vacation("2026-05-04", 480), worked("2026-05-05", 240)],
      { year: 2026, month: 5 },
      [],
      "Worked",
    );
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      "Development",
      "Vacation",
    ]);
    expect(sheets[0]!.months).toEqual([5]);
  });

  it("marks weekends and red days and leaves out days a month lacks", () => {
    const [sheet] = buildExportSheets(
      [worked("2026-05-01", 120), worked("2026-05-01", 60)],
      { year: 2026 },
      ["2026-05-01"],
      "Worked",
    );
    expect(sheet!.months).toHaveLength(12);
    // 1 May 2026 is a red day with time reported on it anyway.
    expect(sheet!.days[0]![4]).toEqual({ kind: "closed", minutes: 180 });
    // 2 May 2026 is a Saturday, 4 May a Monday.
    expect(sheet!.days[1]![4]).toEqual({ kind: "closed", minutes: null });
    expect(sheet!.days[3]![4]).toEqual({ kind: "workday", minutes: null });
    expect(sheet!.days[29]![1]).toEqual({ kind: "missing" });
    expect(sheet!.totalMinutes[4]).toBe(180);
    // May 2026 has 21 weekdays, one of them the red day.
    expect(sheet!.possibleMinutes[4]).toBe(20 * 480);
  });

  it("keeps entries outside the period out", () => {
    const [sheet] = buildExportSheets(
      [worked("2026-04-30", 480), worked("2026-05-04", 480)],
      { year: 2026, month: 5 },
      [],
      "Worked",
    );
    expect(sheet!.totalMinutes).toEqual([480]);
  });

  it("still gives one empty tab without entries", () => {
    const sheets = buildExportSheets(
      [],
      { year: 2026, month: 2 },
      [],
      "Worked",
    );
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.name).toBe("Worked");
    expect(sheets[0]!.totalMinutes).toEqual([0]);
  });
});

describe("sheetNames", () => {
  it("cleans, shortens and de-duplicates tab names", () => {
    expect(
      sheetNames(["Project [A]/B", "x".repeat(40), "x".repeat(40), "", "a"]),
    ).toEqual([
      "Project A B",
      "x".repeat(31),
      `${"x".repeat(27)} (2)`,
      "Sheet",
      "a",
    ]);
  });
});

describe("exportFileName", () => {
  it("names month and year exports", () => {
    expect(exportFileName("Åsa Öberg", { year: 2026, month: 5 })).toBe(
      "TimeReport_ÅsaÖberg_2026_05.xlsx",
    );
    expect(exportFileName("Anna-Lena Berg", { year: 2026 })).toBe(
      "TimeReport_AnnaLenaBerg_2026.xlsx",
    );
  });

  it("accepts only real periods", () => {
    expect(isValidExportPeriod({ year: 2026, month: 12 })).toBe(true);
    expect(isValidExportPeriod({ year: 2026, month: 13 })).toBe(false);
    expect(isValidExportPeriod({ year: 1999 })).toBe(false);
  });
});

describe("reportVisibleTo", () => {
  it("shows consultants to staff and reporting managers to admins only", () => {
    expect(reportVisibleTo("manager", { role: "consultant" })).toBe(true);
    expect(
      reportVisibleTo("manager", { role: "accountant", reportsTime: true }),
    ).toBe(false);
    expect(
      reportVisibleTo("admin", { role: "accountant", reportsTime: true }),
    ).toBe(true);
    expect(reportVisibleTo("admin", { role: "admin" })).toBe(false);
  });
});

describe("timeReportWorkbook", () => {
  const labels = {
    dayOfMonth: "Day of month",
    total: "Total",
    totalPossible: "Total possible",
    monthNames: Array.from({ length: 12 }, (_, index) => `M${index + 1}`),
  };

  it("writes a workbook with a sheet per tab", () => {
    const sheets = buildExportSheets(
      [worked("2026-05-04", 450), vacation("2026-05-05", 480)],
      { year: 2026 },
      [],
      "Worked",
    );
    const files = unzip(timeReportWorkbook(sheets, labels));
    expect([...files.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]);
    expect(files.get("xl/workbook.xml")).toContain(
      '<sheet name="Development" sheetId="1" r:id="rId1"/>',
    );
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain('<c r="F5" s="2"><v>7.5</v></c>');
    expect(sheet).toContain("<f>SUM(F2:F32)</f><v>7.5</v>");
    expect(sheet).toContain("<t>M12</t>");
    expect(sheet).toContain('<dimension ref="A1:M35"/>');
  });

  it("escapes names and labels", () => {
    const sheets = buildExportSheets(
      [{ ...worked("2026-05-04", 60), name: 'R&D <"x">' }],
      { year: 2026, month: 5 },
      [],
      "Worked",
    );
    const files = unzip(
      timeReportWorkbook(sheets, { ...labels, total: "A & B" }),
    );
    expect(files.get("xl/workbook.xml")).toContain(
      'name="R&amp;D &lt;&quot;x&quot;&gt;"',
    );
    expect(files.get("xl/worksheets/sheet1.xml")).toContain("<t>A &amp; B</t>");
  });
});
