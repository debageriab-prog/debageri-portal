import { describe, expect, it } from "vitest";
import type { SalaryLine } from "@/domain/salary/articles";
import { buildSalaryLines } from "@/domain/salary/build";
import { salaryTotals } from "@/domain/salary/totals";
import en from "@/locales/en.json";
import {
  formatAmount,
  salarySlipFileName,
  salarySlipPdf,
  slipEmployerFee,
  type SalarySlipPdfLabels,
} from "@/server/export/salary-slip-pdf";

const labels = Object.fromEntries(
  Object.entries(en)
    .filter(([key]) => key.startsWith("salarySlipPdf_"))
    .map(([key, value]) => [key.replace("salarySlipPdf_", ""), value]),
) as SalarySlipPdfLabels;

function manual(id: string, article: SalaryLine["article"], price: number) {
  return {
    id,
    article,
    label: "",
    from: null,
    to: null,
    scopeBps: 10_000,
    quantityHundredths: 100,
    unitPriceMinor: price,
    manual: true,
  } satisfies SalaryLine;
}

function augustSlip() {
  const lines = [
    ...buildSalaryLines({
      period: "2026-08",
      agreement: {
        model: "fixed",
        fixedMonthlySalaryMinor: 4_460_000,
        requestedMonthlySalaryMinor: null,
      },
      supplementBps: 80,
      eventFrom: "2026-07-01",
      eventTo: "2026-07-31",
      holidays: new Set(),
      entries: [
        "2026-07-01",
        "2026-07-02",
        "2026-07-03",
        "2026-07-10",
        "2026-07-17",
        "2026-07-24",
        "2026-07-31",
      ].map((date) => ({ date, minutes: 480, category: "vacation" as const })),
    }),
    { ...manual("health", "benefit", 19_600), label: "Sjukvårdsförsäkring" },
    { ...manual("parking", "benefit", 126_000), label: "Parkeringsförmån" },
    { ...manual("bike", "benefit", 18_100), label: "Förmånscykel" },
    { ...manual("lease", "grossDeduction", -73_900), label: "Cykelavdrag" },
  ];
  return {
    period: "2026-08",
    paymentDate: "2026-08-25",
    eventFrom: "2026-07-01",
    eventTo: "2026-07-31",
    person: {
      displayName: "Anna Andersson",
      employeeNumber: "DB-006",
      personalNumber: "19811218-9876",
      addressLine: "Exempelgatan 12C",
      postalCode: "412 63",
      city: "Göteborg",
      bankClearing: "8327",
      bankAccount: "123 456 789",
    },
    tax: {
      year: 2026,
      table: 33,
      column: 1 as const,
      adjustment: { type: "none" as const },
      overrideMinor: null,
    },
    lines,
    totals: salaryTotals(lines, {
      table: null,
      column: 1,
      adjustment: { type: "none" },
      overrideMinor: 1_104_200,
    }),
    yearToDate: {
      grossMinor: 36_175_000,
      benefitsMinor: 1_143_900,
      taxMinor: 9_043_600,
    },
    vacation: { paidDays: 15, savedDays: 6 },
  };
}

describe("payslip PDF", () => {
  it("renders one A4 page", () => {
    const pdf = salarySlipPdf({
      slip: augustSlip(),
      lineNames: { monthlySalary: "Monthly salary" },
      employer: { name: "Debageri AB", orgNumber: "559000-0000" },
      labels,
    });
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("/MediaBox [0 0 595 842]");
    expect(pdf.length).toBeGreaterThan(1_000);
  });

  it("shows the employer contributions by age", () => {
    const slip = augustSlip();
    // 31.42 % of the taxable 47 995 kr.
    expect(slipEmployerFee(slip)).toEqual({
      percent: "31,42",
      minor: 1_508_000,
    });
    const youth = {
      ...slip,
      person: { ...slip.person, personalNumber: "20050101-0000" },
    };
    // 25 000 × 20.81 % + 22 995 × 31.42 % = 5 202.50 + 7 225.03
    expect(slipEmployerFee(youth)).toEqual({
      percent: "20,81 / 31,42",
      minor: 1_242_800,
    });
  });

  it("formats amounts the Swedish way", () => {
    expect(formatAmount(4_460_000).replace(/\s/g, " ")).toBe("44 600,00");
    expect(formatAmount(-73_900).replace(/\s/g, " ")).toBe("−739,00");
    expect(salarySlipFileName("Payslip", "2026-08", "Anna / Andersson")).toBe(
      "Payslip 2026-08 Anna Andersson.pdf",
    );
  });
});
