import { inflateRawSync, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  normalizePermissions,
  permissionsForAudience,
} from "@/domain/access/permissions";
import {
  buildFinanceReport,
  financeReportFileName,
  type FinanceReport,
  type ReportRow,
  type ReportTransaction,
} from "@/domain/finance/report-export";
import {
  financeReportPdf,
  pdfAmount,
} from "@/server/export/finance-report-pdf";
import { financeReportWorkbook } from "@/server/export/finance-report-workbook";

const labels = {
  openingBalance: "Balance at start",
  workedHours: "Worked hours",
  hourlyRate: "Hourly rate",
  invoiced: "Invoiced",
  paidInvoices: "Paid invoices",
  share: "Your share",
  totalIncome: "Total income",
  totalExpenses: "Total expenses",
  result: "Remaining",
  closingBalance: "Balance at end",
};

const categories = [
  {
    id: "c-income",
    code: "assignment_income",
    name: { en: "Assignment income", sv: "Uppdragsintäkt" },
  },
  {
    id: "c-other",
    code: "other_income",
    name: { en: "Other income", sv: "Övrig intäkt" },
  },
  { id: "c-salary", code: "salary", name: { en: "Salary", sv: "Lön" } },
  {
    id: "c-employer",
    code: "employer_tax",
    name: { en: "Employer contributions", sv: "Arbetsgivaravgifter" },
  },
  { id: "c-pension", code: "pension", name: { en: "Pension", sv: "Pension" } },
  {
    id: "c-phone",
    code: "phone",
    name: { en: "Mobile subscription", sv: "Mobilabonnemang" },
  },
  {
    id: "c-insurance",
    code: "insurance",
    name: { en: "Insurance", sv: "Försäkring" },
  },
];

const income = (
  date: string,
  minor: number,
  invoiceId: string | null = "inv",
  categoryId = "c-income",
): ReportTransaction => ({
  direction: "income",
  categoryId,
  invoiceId,
  date,
  consultantBalanceDeltaMinor: minor,
});
const expense = (
  date: string,
  categoryId: string,
  minor: number,
): ReportTransaction => ({
  direction: "expense",
  categoryId,
  invoiceId: null,
  date,
  consultantBalanceDeltaMinor: -minor,
});

const transactions = [
  income("2026-04-30", 10_000_00),
  income("2026-07-03", 82_620_00),
  income("2026-08-05", 104_040_00),
  income("2026-08-10", 500_00, null, "c-other"),
  expense("2026-06-25", "c-salary", 55_000_00),
  expense("2026-06-25", "c-employer", 17_281_00),
  expense("2026-06-25", "c-pension", 3_300_00),
  expense("2026-07-25", "c-salary", 55_000_00),
  expense("2026-07-12", "c-phone", 299_00),
  expense("2026-08-12", "c-insurance", 450_00),
  // Reversed in the same month, so the phone row nets to zero in August.
  expense("2026-08-01", "c-phone", 299_00),
  expense("2026-08-02", "c-phone", -299_00),
];

function report(month?: number, language: "en" | "sv" = "en") {
  return buildFinanceReport({
    period: { year: 2026, month },
    categories,
    transactions,
    invoices: [
      {
        status: "paid",
        issueDate: "2026-06-01",
        periodFrom: "2026-05-01",
        paidDate: "2026-07-03",
        netMinor: 91_800_00,
        shareBps: 9_000,
      },
      {
        status: "paid",
        issueDate: "2026-07-01",
        periodFrom: "2026-06-01",
        paidDate: "2026-08-05",
        netMinor: 115_600_00,
        shareBps: 9_000,
      },
      {
        status: "void",
        issueDate: "2026-07-01",
        paidDate: null,
        netMinor: 999_00,
        shareBps: 9_000,
      },
    ],
    workedEntries: [
      { date: "2026-05-11", minutes: 480, hourlyRate: 850 },
      { date: "2026-05-12", minutes: 240, hourlyRate: 850 },
      { date: "2026-06-01", minutes: 480, hourlyRate: 900 },
    ],
    language,
    labels,
  });
}

const values = (built: FinanceReport) =>
  built.rows.filter(
    (row): row is Extract<ReportRow, { kind: "values" }> =>
      row.kind === "values",
  );
const find = (built: FinanceReport, label: string) =>
  values(built).find((row) => row.label === label)!;

describe("buildFinanceReport", () => {
  it("puts income first, then other expenses, then salary", () => {
    const built = report();
    expect(
      built.rows.map((row) =>
        row.kind === "separator" ? `--${row.tone}` : row.label,
      ),
    ).toEqual([
      "Balance at start",
      "Worked hours",
      "Hourly rate",
      "Invoiced",
      "Paid invoices",
      "Your share (90%)",
      "Other income",
      "Total income",
      "--income",
      "Insurance",
      "Mobile subscription",
      "--expenses",
      "Salary",
      "Employer contributions",
      "Pension",
      "Total expenses",
      "Remaining",
      "Balance at end",
    ]);
    expect(built.showTotal).toBe(true);
    expect(built.months).toHaveLength(12);
  });

  it("adds up each month and carries the balance over", () => {
    const built = report();
    // Indexes 4 to 7 are May to August.
    expect(find(built, "Balance at start").values.slice(4, 8)).toEqual([
      10_000_00, 10_000_00, -65_581_00, -38_260_00,
    ]);
    expect(find(built, "Your share (90%)").values[6]).toBe(82_620_00);
    expect(find(built, "Total expenses").values[5]).toBe(75_581_00);
    expect(find(built, "Remaining").values[6]).toBe(82_620_00 - 55_299_00);
    expect(find(built, "Balance at end").values[7]).toBe(
      -38_260_00 + 104_540_00 - 450_00,
    );
    // Closing equals opening plus what was left, every month.
    const opening = find(built, "Balance at start").values;
    const result = find(built, "Remaining").values;
    const closing = find(built, "Balance at end").values;
    closing.forEach((value, index) =>
      expect(value).toBe(opening[index]! + result[index]!),
    );
    expect(find(built, "Balance at start").total).toBe(0);
    expect(find(built, "Balance at end").total).toBe(closing[11]);
  });

  it("shows hours, the weighted rate and invoices by month", () => {
    const built = report();
    expect(find(built, "Worked hours").values.slice(4, 7)).toEqual([
      12,
      8,
      null,
    ]);
    expect(find(built, "Hourly rate").values[4]).toBe(850);
    expect(find(built, "Hourly rate").total).toBe(870);
    expect(find(built, "Invoiced").values.slice(4, 7)).toEqual([
      91_800_00, 115_600_00, 0,
    ]);
    expect(find(built, "Paid invoices").values.slice(6, 8)).toEqual([
      91_800_00, 115_600_00,
    ]);
  });

  it("leaves out categories that net to zero in the period", () => {
    const built = report(8);
    expect(built.months).toEqual([8]);
    expect(built.showTotal).toBe(false);
    const labelsShown = values(built).map((row) => row.label);
    expect(labelsShown).toContain("Insurance");
    expect(labelsShown).not.toContain("Mobile subscription");
    expect(labelsShown).not.toContain("Salary");
  });

  it("names categories in the reader's language", () => {
    expect(values(report(6, "sv")).map((row) => row.label)).toContain(
      "Arbetsgivaravgifter",
    );
  });
});

describe("finance report permissions", () => {
  it("keeps the own export with consultants and adds the view parent", () => {
    expect(permissionsForAudience("consultant")).toContain("my.finance.export");
    expect(permissionsForAudience("staff")).not.toContain("my.finance.export");
    expect(normalizePermissions(["finance.overview.export"], "staff")).toEqual([
      "finance.ledger.view",
      "finance.overview.export",
    ]);
    expect(normalizePermissions(["my.finance.export"], "consultant")).toEqual([
      "my.finance",
      "my.finance.export",
    ]);
  });
});

describe("financeReportFileName", () => {
  it("names month and year reports", () => {
    expect(
      financeReportFileName("Åsa Öberg", { year: 2026, month: 7 }, "xlsx"),
    ).toBe("FinanceReport_ÅsaÖberg_2026_07.xlsx");
    expect(financeReportFileName("Anna Berg", { year: 2026 }, "pdf")).toBe(
      "FinanceReport_AnnaBerg_2026.pdf",
    );
  });
});

const header = {
  title: "Anna Berg · 2026",
  total: "Total",
  sheetName: "Financial report",
  monthNames: Array.from({ length: 12 }, (_, index) => `M${index + 1}`),
};

function sheetXml(data: Buffer) {
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let cursor = data.readUInt32LE(end + 16);
  const files = new Map<string, string>();
  for (let index = 0; index < data.readUInt16LE(end + 10); index += 1) {
    const size = data.readUInt32LE(cursor + 20);
    const nameLength = data.readUInt16LE(cursor + 28);
    const offset = data.readUInt32LE(cursor + 42);
    const name = data.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    const start = offset + 30 + data.readUInt16LE(offset + 26);
    files.set(
      name,
      inflateRawSync(data.subarray(start, start + size)).toString("utf8"),
    );
    cursor += 46 + nameLength;
  }
  return files;
}

describe("financeReportWorkbook", () => {
  it("writes kronor, a Total column with sums and the month headers", () => {
    const files = sheetXml(financeReportWorkbook(report(), header));
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    expect(files.get("xl/workbook.xml")).toContain('name="Financial report"');
    expect(sheet).toContain("<t>Anna Berg · 2026</t>");
    expect(sheet).toContain("<t>M12</t>");
    expect(sheet).toContain('<dimension ref="A1:N19"/>');
    // Your share is row 7; July is column I.
    expect(sheet).toMatch(/<c r="I7" s="8"><v>82620<\/v><\/c>/);
    expect(sheet).toContain("<f>SUM(C7:N7)</f><v>196660</v>");
    // Balances are not summed across the year.
    expect(sheet).toMatch(/<c r="B2" s="16"><v>0<\/v><\/c>/);
    expect(sheet).toMatch(/<c r="G2" s="16"><v>10000<\/v><\/c>/);
    expect(files.get("xl/styles.xml")).toContain('formatCode="#,##0;-#,##0"');
  });

  it("has no Total column for a month", () => {
    const sheet = sheetXml(financeReportWorkbook(report(7), header)).get(
      "xl/worksheets/sheet1.xml",
    )!;
    expect(sheet).toContain('<dimension ref="A1:B');
    expect(sheet).not.toContain("<f>");
  });
});

describe("financeReportPdf", () => {
  function pages(pdf: Buffer) {
    const source = pdf.toString("latin1");
    return {
      boxes: [...source.matchAll(/\/MediaBox \[0 0 (\d+) (\d+)\]/g)].map(
        (match) => [Number(match[1]), Number(match[2])],
      ),
      streams: [...source.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(
        (match) =>
          inflateSync(Buffer.from(match[1]!, "latin1")).toString("latin1"),
      ),
    };
  }
  const pdfHeader = { ...header, subtitle: "Financial report · 2026" };

  it("prints a year on one landscape page and a month in portrait", () => {
    const year = pages(financeReportPdf(report(), pdfHeader, "en-SE"));
    expect(year.boxes).toEqual([[842, 595]]);
    expect(year.streams[0]).toContain("(Your share \\(90%\\)) Tj");
    expect(year.streams[0]).toContain("(M12) Tj");
    const month = pages(financeReportPdf(report(7), pdfHeader, "sv-SE"));
    expect(month.boxes).toEqual([[595, 842]]);
  });

  it("formats kronor with characters the standard fonts have", () => {
    expect(pdfAmount(-7_638_200, "sv-SE")).toBe("-76 382");
    expect(pdfAmount(12_345_678, "en-SE")).toMatch(/^123.457$/);
  });
});
