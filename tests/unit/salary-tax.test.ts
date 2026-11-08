import { describe, expect, it } from "vitest";
import { normalizePersonalNumber } from "@/domain/salary/personal-number";
import {
  emptyPayrollProfile,
  payrollProfileFrom,
  payrollProfileGaps,
} from "@/domain/salary/payroll-profile";
import {
  lookupTaxMinor,
  parseMunicipalities,
  parseTaxTables,
  suggestTaxTable,
  taxMinor,
  taxRateFor,
} from "@/domain/salary/tax";
import { payrollProfileSchema } from "@/server/validators/payroll";

/** Rows shaped like Skatteverket's "Skattetabeller för månadslön". */
function tableRow(
  table: number,
  from: number,
  to: number | "",
  period: "30B" | "30%",
  columns: number[],
  year = 2026,
) {
  return {
    år: String(year),
    tabellnr: String(table),
    "antal dgr": period,
    "inkomst fr.o.m.": String(from),
    "inkomst t.o.m.": String(to),
    ...Object.fromEntries(
      columns.map((value, index) => [`kolumn ${index + 1}`, String(value)]),
    ),
    "kolumn 7": "",
  };
}

const rows = [
  tableRow(33, 47801, 48000, "30B", [11042, 10888, 7783, 10390, 15335, 15335]),
  tableRow(33, 1, 2000, "30B", [0, 0, 0, 0, 0, 0]),
  tableRow(33, 80001, 81000, "30%", [33, 33, 29, 29, 39, 39]),
  tableRow(33, 1_000_001, "", "30%", [52, 52, 50, 50, 55, 55]),
  // Other periods and years are left out.
  tableRow(33, 47801, 48000, "30B", [1, 1, 1, 1, 1, 1], 2025),
  { ...tableRow(33, 1, 2000, "30B", [0, 0, 0, 0, 0, 0]), "antal dgr": "15B" },
];

describe("Skatteverket monthly tax tables", () => {
  const [table] = parseTaxTables(rows, 2026);

  it("keeps the 2026 monthly rows of each table, sorted by income", () => {
    expect(table).toMatchObject({ year: 2026, table: 33 });
    expect(table!.rows.map((row) => row.from)).toEqual([
      1, 47801, 80001, 1_000_001,
    ]);
    expect(table!.rows.at(-1)).toMatchObject({ to: null, kind: "percent" });
  });

  it("withholds 11 042 kr on the August payslip's 47 995.60 kr", () => {
    // 44 600 salary + 2 497.60 vacation supplement − 739 bike lease
    // + 1 637 benefits.
    expect(lookupTaxMinor(table!, 1, 4_799_560)).toBe(1_104_200);
    expect(lookupTaxMinor(table!, 3, 4_799_560)).toBe(778_300);
  });

  it("takes a percent of the income above the amount brackets", () => {
    expect(lookupTaxMinor(table!, 1, 8_050_099)).toBe(2_656_500);
    expect(lookupTaxMinor(table!, 1, 200_000_000)).toBe(104_000_000);
  });

  it("withholds nothing on no pay and refuses a gap in the table", () => {
    expect(lookupTaxMinor(table!, 1, 0)).toBe(0);
    expect(() => lookupTaxMinor(table!, 1, 3_000_000)).toThrow();
  });

  it("refuses a row it cannot read", () => {
    expect(() =>
      parseTaxTables([{ ...rows[0], "kolumn 1": "n/a" }], 2026),
    ).toThrow();
  });
});

describe("jämkning", () => {
  const [table] = parseTaxTables(rows, 2026);

  it("replaces the table tax with a percent or a fixed amount", () => {
    expect(taxMinor(table!, 1, 4_799_560, { type: "percent", bps: 2500 })).toBe(
      1_199_900,
    );
    expect(
      taxMinor(null, 1, 4_799_560, { type: "amount", minor: 900_000 }),
    ).toBe(900_000);
    expect(taxMinor(table!, 1, 4_799_560, { type: "none" })).toBe(1_104_200);
    expect(() => taxMinor(null, 1, 4_799_560, { type: "none" })).toThrow();
  });
});

describe("tax rates per kommun", () => {
  const rateRows = [
    ["0114", "UPPLANDS VÄSBY", "EDS FÖRSAMLING", "32.042", "32.902"],
    ["0114", "UPPLANDS VÄSBY", "FRESTA FÖRSAMLING", "32.042", "32.942"],
    ["1480", "GÖTEBORG", "DOMKYRKOFÖRSAMLINGEN", "32.600", "33.600"],
  ].map(([code, kommun, parish, without, withChurch]) => ({
    år: "2026",
    "församlings-kod": `${code!.slice(0, 2)} ${code!.slice(2)}`,
    kommun,
    församling: parish,
    "summa, exkl. kyrkoavgift": without,
    "summa, inkl. kyrkoavgift": withChurch,
  }));
  const municipalities = parseMunicipalities(rateRows, 2026);

  it("groups parishes under their kommun", () => {
    expect(municipalities.map((item) => item.name)).toEqual([
      "GÖTEBORG",
      "UPPLANDS VÄSBY",
    ]);
    expect(municipalities[1]).toMatchObject({ code: "0114", rate: 32042 });
    expect(municipalities[1]!.parishes).toHaveLength(2);
  });

  it("suggests the table from the rate, rounding half down", () => {
    expect(suggestTaxTable(32042)).toBe(32);
    expect(suggestTaxTable(32500)).toBe(32);
    expect(suggestTaxTable(32501)).toBe(33);
    expect(suggestTaxTable(32600)).toBe(33);
  });

  it("adds the church fee of the member's parish", () => {
    const [goteborg, vasby] = municipalities;
    expect(taxRateFor(vasby!, false)).toBe(32042);
    expect(taxRateFor(vasby!, true, "FRESTA FÖRSAMLING")).toBe(32942);
    // With several parishes one must be chosen.
    expect(taxRateFor(vasby!, true)).toBeNull();
    expect(taxRateFor(goteborg!, true)).toBe(33600);
  });
});

describe("personal identity numbers", () => {
  it("normalizes valid numbers to twelve digits", () => {
    expect(normalizePersonalNumber("811218-9876", "2026-11-07")).toBe(
      "19811218-9876",
    );
    expect(normalizePersonalNumber("198112189876")).toBe("19811218-9876");
    expect(normalizePersonalNumber("19811218-9876")).toBe("19811218-9876");
  });

  it("accepts coordination numbers and the + of centenarians", () => {
    expect(normalizePersonalNumber("701063-2391", "2026-11-07")).toBe(
      "19701063-2391",
    );
    expect(normalizePersonalNumber("121212+1212", "2026-11-07")).toBe(
      "19121212-1212",
    );
  });

  it("rejects bad check digits, dates and shapes", () => {
    expect(normalizePersonalNumber("811218-9875")).toBeNull();
    expect(normalizePersonalNumber("19810230-9876")).toBeNull();
    expect(normalizePersonalNumber("81121-89876")).toBeNull();
    expect(normalizePersonalNumber("")).toBeNull();
  });
});

describe("payroll profile", () => {
  it("validates and normalizes the form", () => {
    const parsed = payrollProfileSchema.parse({
      personalNumber: "811218-9876",
      addressLine: "Exempelgatan 12C",
      postalCode: "412 63",
      city: "Göteborg",
      municipalityCode: "1480",
      churchMember: false,
      parish: "DOMKYRKOFÖRSAMLINGEN",
      taxTable: 33,
      taxColumn: 1,
    });
    expect(parsed).toMatchObject({
      personalNumber: "19811218-9876",
      parish: "",
      taxAdjustment: { type: "none" },
    });
    expect(
      payrollProfileSchema.safeParse({ personalNumber: "811218-9875" }).success,
    ).toBe(false);
    expect(payrollProfileSchema.safeParse({ taxColumn: 7 }).success).toBe(
      false,
    );
  });

  it("lists what still blocks a payslip", () => {
    expect(payrollProfileGaps(emptyPayrollProfile())).toEqual([
      "payrollGap_personalNumber",
      "payrollGap_address",
      "payrollGap_taxTable",
    ]);
    expect(
      payrollProfileGaps(
        payrollProfileFrom({
          personalNumber: "19811218-9876",
          addressLine: "Exempelgatan 12C",
          postalCode: "412 63",
          city: "Göteborg",
          taxAdjustment: { type: "percent", bps: 3000 },
        }),
      ),
    ).toEqual([]);
  });
});
