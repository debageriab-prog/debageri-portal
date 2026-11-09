import { describe, expect, it } from "vitest";
import {
  lineAmountMinor,
  lineDirection,
  type SalaryLine,
} from "@/domain/salary/articles";
import {
  buildSalaryLines,
  dateRuns,
  hourlyRateMinor,
  type SalaryTimeEntry,
} from "@/domain/salary/build";
import { copiedSalaryLines, salaryBookingSteps } from "@/domain/salary/slip";
import { parseTaxTables } from "@/domain/salary/tax";
import {
  DEFAULT_EMPLOYER_FEE_BPS,
  employerFeeMinor,
  salaryTotals,
} from "@/domain/salary/totals";
import {
  expectedMinutes,
  monthBounds,
  previousMonth,
} from "@/domain/time/working-days";

const fixed = (salary: number) => ({
  model: "fixed" as const,
  fixedMonthlySalaryMinor: salary,
  requestedMonthlySalaryMinor: null,
});

const day = (
  date: string,
  category: SalaryTimeEntry["category"],
  minutes = 480,
) => ({ date, category, minutes });

/** The August 2026 payslip: July's vacation, paid with August's salary. */
const august = {
  period: "2026-08",
  agreement: fixed(4_460_000),
  supplementBps: 80,
  eventFrom: "2026-07-01",
  eventTo: "2026-07-31",
  holidays: new Set<string>(),
  entries: [
    ...["2026-07-01", "2026-07-02", "2026-07-03"].map((date) =>
      day(date, "vacation"),
    ),
    ...["2026-07-10", "2026-07-17", "2026-07-24", "2026-07-31"].map((date) =>
      day(date, "vacation"),
    ),
    day("2026-07-06", "work"),
  ],
};

function manual(
  id: string,
  article: SalaryLine["article"],
  unitPriceMinor: number,
): SalaryLine {
  return {
    id,
    article,
    label: "",
    from: null,
    to: null,
    scopeBps: 10_000,
    quantityHundredths: 100,
    unitPriceMinor,
    manual: true,
  };
}

const table33 = parseTaxTables(
  [
    {
      år: "2026",
      tabellnr: "33",
      "antal dgr": "30B",
      "inkomst fr.o.m.": "47801",
      "inkomst t.o.m.": "48000",
      "kolumn 1": "11042",
      "kolumn 2": "10888",
      "kolumn 3": "7783",
      "kolumn 4": "10390",
      "kolumn 5": "15335",
      "kolumn 6": "15335",
    },
  ],
  2026,
)[0]!;

describe("salary lines", () => {
  const lines = buildSalaryLines(august);

  it("pays the month's salary and a supplement per run of vacation", () => {
    expect(
      lines.map((line) => [
        line.article,
        line.from,
        line.to,
        line.quantityHundredths,
        line.unitPriceMinor,
      ]),
    ).toEqual([
      ["monthlySalary", "2026-08-01", "2026-08-31", 100, 4_460_000],
      ["vacationSupplement", "2026-07-01", "2026-07-03", 300, 35_680],
      ["vacationSupplement", "2026-07-10", "2026-07-10", 100, 35_680],
      ["vacationSupplement", "2026-07-17", "2026-07-17", 100, 35_680],
      ["vacationSupplement", "2026-07-24", "2026-07-24", 100, 35_680],
      ["vacationSupplement", "2026-07-31", "2026-07-31", 100, 35_680],
    ]);
    expect(lineAmountMinor(lines[1]!)).toBe(107_040);
  });

  it("matches the payslip to the öre, with benefits and a bike lease", () => {
    const all = [
      ...lines,
      manual("health", "benefit", 19_600),
      manual("parking", "benefit", 126_000),
      manual("bike", "benefit", 18_100),
      manual("lease", "grossDeduction", -73_900),
    ];
    expect(
      salaryTotals(all, {
        table: table33,
        column: 1,
        adjustment: { type: "none" },
      }),
    ).toEqual({
      grossMinor: 4_635_860,
      benefitsMinor: 163_700,
      taxableMinor: 4_799_560,
      taxMinor: 1_104_200,
      oneTimeMinor: 0,
      oneTimeTaxMinor: 0,
      oneTimePercent: null,
      netDeductionsMinor: 0,
      reimbursementsMinor: 0,
      roundingMinor: 40,
      netMinor: 3_531_700,
    });
  });

  it("pays a flexible consultant's requested salary", () => {
    const [salary] = buildSalaryLines({
      ...august,
      entries: [],
      agreement: {
        model: "flexible",
        fixedMonthlySalaryMinor: null,
        requestedMonthlySalaryMinor: 5_000_000,
      },
    });
    expect(salary).toMatchObject({ unitPriceMinor: 5_000_000 });
    expect(
      buildSalaryLines({
        ...august,
        agreement: {
          model: "flexible",
          fixedMonthlySalaryMinor: null,
          requestedMonthlySalaryMinor: null,
        },
      }),
    ).toEqual([]);
  });

  it("deducts unpaid leave by the hour and sick time at 20 % plus a waiting day", () => {
    const hourly = hourlyRateMinor(4_160_000);
    expect(hourly).toBe(24_000);
    const result = buildSalaryLines({
      ...august,
      agreement: fixed(4_160_000),
      entries: [
        day("2026-07-07", "unpaid_leave", 240),
        day("2026-07-13", "sick_leave"),
        day("2026-07-14", "sick_leave"),
      ],
    });
    expect(
      result
        .filter((line) => line.article !== "monthlySalary")
        .map((line) => [
          line.article,
          line.quantityHundredths,
          line.unitPriceMinor,
        ]),
    ).toEqual([
      ["unpaidLeave", 400, -24_000],
      ["sickLeave", 1600, -4_800],
      ["sickWaitingDay", 100, -153_600],
    ]);
  });

  it("deducts 4.6 % per unpaid vacation day", () => {
    const result = buildSalaryLines({
      ...august,
      entries: [],
      unpaidVacationDays: 2,
    });
    expect(result.at(-1)).toMatchObject({
      article: "unpaidVacation",
      quantityHundredths: 200,
      unitPriceMinor: -205_160,
    });
  });
});

describe("salary totals", () => {
  it("takes net deductions after tax and lets typed tax win", () => {
    const totals = salaryTotals(
      [
        manual("salary", "monthlySalary", 3_000_000),
        manual("lunch", "netDeduction", -50_050),
      ],
      {
        table: null,
        column: 1,
        adjustment: { type: "percent", bps: 3000 },
        overrideMinor: 800_000,
      },
    );
    expect(totals).toMatchObject({
      taxMinor: 800_000,
      netDeductionsMinor: -50_050,
      netMinor: 2_150_000,
      roundingMinor: 50,
    });
  });

  it("pays a tax-free reimbursement after tax, outside taxable pay", () => {
    const totals = salaryTotals(
      [
        manual("salary", "monthlySalary", 3_000_000),
        {
          ...manual("headphones", "reimbursement", 249_000),
          item: "equipment",
        },
        manual("headphones-deduction", "grossDeduction", -149_000),
      ],
      {
        table: null,
        column: 1,
        adjustment: { type: "none" },
        overrideMinor: 700_000,
      },
    );
    expect(totals).toMatchObject({
      grossMinor: 2_851_000,
      taxableMinor: 2_851_000,
      reimbursementsMinor: 249_000,
      netMinor: 2_400_000,
    });
  });

  it("tells payments from deductions", () => {
    expect(lineDirection(manual("a", "grossDeduction", -100))).toBe(
      "deduction",
    );
    expect(lineDirection(manual("b", "unpaidLeave", -100))).toBe("deduction");
    expect(lineDirection(manual("c", "reimbursement", 100))).toBe("payment");
  });

  it("works out employer contributions in whole kronor", () => {
    expect(employerFeeMinor(4_799_560, DEFAULT_EMPLOYER_FEE_BPS)).toBe(
      1_508_000,
    );
  });
});

describe("working days", () => {
  it("groups a Friday with the following Monday, and skips red days", () => {
    expect(
      dateRuns(["2026-07-03", "2026-07-06", "2026-07-08"], new Set()),
    ).toEqual([["2026-07-03", "2026-07-06"], ["2026-07-08"]]);
    expect(
      dateRuns(["2026-06-18", "2026-06-22"], new Set(["2026-06-19"])),
    ).toEqual([["2026-06-18", "2026-06-22"]]);
  });

  it("knows months and the minutes they expect", () => {
    expect(monthBounds("2028-02")).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
    expect(previousMonth("2027-01")).toBe("2026-12");
    expect(expectedMinutes("2026-07-01", "2026-07-31", new Set())).toBe(
      23 * 480,
    );
  });
});

describe("one-time tax (engångsskatt)", () => {
  const lines = [
    ...buildSalaryLines(august),
    manual("health", "benefit", 19_600),
    manual("parking", "benefit", 126_000),
    manual("bike", "benefit", 18_100),
    manual("lease", "grossDeduction", -73_900),
  ];
  const bonus = (amount: number): SalaryLine => ({
    ...manual("bonus", "otherPay", amount),
    item: "bonus",
    oneTime: true,
  });
  const basis = {
    table: table33,
    column: 1 as const,
    adjustment: { type: "none" as const },
    year: 2026,
  };

  it("taxes a bonus apart, at the percent for the expected annual income", () => {
    // 47 995.60 × 12 + 10 000 = 585 947 kr a year: 34 % in column 1.
    const totals = salaryTotals([...lines, bonus(1_000_000)], basis);
    expect(totals.oneTimeMinor).toBe(1_000_000);
    expect(totals.oneTimePercent).toBe(34);
    expect(totals.oneTimeTaxMinor).toBe(340_000);
    // The monthly salary keeps its table tax.
    expect(totals.taxMinor).toBe(1_104_200 + 340_000);
    expect(totals.grossMinor).toBe(4_635_860 + 1_000_000);
  });

  it("counts earlier one-time payments of the year", () => {
    const totals = salaryTotals([...lines, bonus(1_000_000)], {
      ...basis,
      oneTimeEarlierMinor: 8_000_000,
    });
    expect(totals.oneTimePercent).toBe(54);
    expect(totals.oneTimeTaxMinor).toBe(540_000);
  });

  it("uses 30 % without a monthly salary", () => {
    const totals = salaryTotals([bonus(1_000_000)], basis);
    expect(totals.oneTimePercent).toBe(30);
    expect(totals.taxMinor).toBe(300_000);
  });

  it("leaves the percent open for a year without a table", () => {
    const totals = salaryTotals([...lines, bonus(1_000_000)], {
      ...basis,
      year: 2030,
    });
    expect(totals.oneTimePercent).toBeNull();
    expect(totals.oneTimeTaxMinor).toBe(0);
  });

  it("applies a jämkning percent to the whole taxable pay", () => {
    const totals = salaryTotals([...lines, bonus(1_000_000)], {
      ...basis,
      adjustment: { type: "percent", bps: 2_500 },
    });
    expect(totals.oneTimeTaxMinor).toBe(0);
    expect(totals.taxMinor).toBe(
      Math.round(((4_799_560 + 1_000_000) * 0.25) / 100) * 100,
    );
  });

  it("ignores lines that are not one-time payments", () => {
    const totals = salaryTotals(
      [...lines, { ...bonus(100), oneTime: false }],
      basis,
    );
    expect(totals.oneTimeMinor).toBe(0);
  });
});

describe("salaryBookingSteps", () => {
  const all = {
    publishPayslip: true,
    notifyEmployee: true,
    createExpenses: true,
    attachPayslip: true,
  };

  it("keeps every chosen step", () => {
    expect(salaryBookingSteps(all)).toEqual(all);
  });

  it("emails only about a published payslip", () => {
    expect(
      salaryBookingSteps({ ...all, publishPayslip: false })?.notifyEmployee,
    ).toBe(false);
  });

  it("attaches the PDF only to expenses that are created", () => {
    expect(
      salaryBookingSteps({ ...all, createExpenses: false })?.attachPayslip,
    ).toBe(false);
  });

  it("refuses a booking that does nothing", () => {
    expect(
      salaryBookingSteps({
        ...all,
        publishPayslip: false,
        createExpenses: false,
      }),
    ).toBeNull();
  });
});

describe("copiedSalaryLines", () => {
  const added: SalaryLine = {
    ...manual("parking", "benefit", 126_000),
    id: "manual-1",
    from: "2026-07-01",
    to: "2026-07-31",
  };
  const built: SalaryLine = { ...added, id: "monthlySalary" };

  it("copies only lines added by hand, with new ids and no dates", () => {
    const copied = copiedSalaryLines([built, added], 42);
    expect(copied).toEqual([
      { ...added, id: "manual-42-0", from: null, to: null, manual: true },
    ]);
  });

  it("gives every copy its own id", () => {
    const copied = copiedSalaryLines([added, { ...added, id: "manual-2" }], 7);
    expect(copied.map((line) => line.id)).toEqual(["manual-7-0", "manual-7-1"]);
  });
});
