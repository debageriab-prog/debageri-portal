import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HistoryView } from "@/app/employee/timesheets/HistoryView";
import {
  consultantIncome,
  type IncomeAgreement,
} from "@/domain/reports/income";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));
vi.mock("@/lib/firebase/client", () => ({ appCheckFetch: vi.fn() }));
vi.mock("@/components/timesheets/TimesheetAttachments", () => ({
  TimesheetAttachments: () => null,
}));
vi.mock("@/components/localization/LocaleProvider", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

const flexible: IncomeAgreement = {
  model: "flexible",
  validFrom: "2026-04-01",
  validTo: null,
  shareBps: 9000,
};
const fixed: IncomeAgreement = {
  model: "fixed",
  validFrom: "2026-01-01",
  validTo: "2026-03-31",
  shareBps: 0,
};
const hybrid: IncomeAgreement = {
  model: "hybrid",
  validFrom: "2026-01-01",
  validTo: null,
  shareBps: 5000,
};
const worked = (date: string, minutes = 480) => ({
  date,
  minutes,
  countsAsWorkedTime: true,
  hourlyRate: 100,
});

describe("consultantIncome", () => {
  it("counts flexible days in full", () => {
    expect(
      consultantIncome(
        [worked("2026-04-01")],
        ["2026-04-01", "2026-04-02"],
        100,
        [flexible],
      ),
    ).toEqual({ worked: 800, notReached: 800, label: "estimatedIncome" });
  });

  it("hides a period that only has fixed days", () => {
    expect(
      consultantIncome([worked("2026-02-02")], ["2026-02-02"], 100, [
        fixed,
        flexible,
      ]),
    ).toBeNull();
  });

  it("leaves fixed days out of a period that also has flexible days", () => {
    expect(
      consultantIncome(
        [worked("2026-03-31"), worked("2026-04-01")],
        ["2026-03-31", "2026-04-01"],
        100,
        [fixed, flexible],
      ),
    ).toEqual({ worked: 800, notReached: 0, label: "estimatedIncome" });
  });

  it("shows only the invoice share for hybrid days", () => {
    expect(
      consultantIncome(
        [worked("2026-02-02")],
        ["2026-02-02", "2026-02-03"],
        100,
        [hybrid],
      ),
    ).toEqual({ worked: 400, notReached: 400, label: "estimatedExtraIncome" });
  });

  it("labels a period of fixed and hybrid days as extra income", () => {
    const later = { ...hybrid, validFrom: "2026-04-01" };

    expect(
      consultantIncome([], ["2026-03-31", "2026-04-01"], 100, [fixed, later])
        ?.label,
    ).toBe("estimatedExtraIncome");
  });

  it("does not show income for days without an agreement", () => {
    expect(
      consultantIncome([worked("2026-02-02")], ["2026-02-02"], 100, []),
    ).toBeNull();
  });
});

function render(
  incomeAgreements: IncomeAgreement[] | undefined,
  period: { mode: "month"; month: string } | { mode: "year" },
) {
  return renderToStaticMarkup(
    createElement(HistoryView, {
      sheets: [],
      entries: [
        {
          timesheetId: "s",
          name: "Regular",
          ...worked("2026-02-02"),
        },
      ],
      currentYear: 2026,
      currentWeek: 6,
      currentMonth: period.mode === "month" ? period.month : "2026-02",
      reportingStartDate: "2026-01-01",
      employmentEndDate: null,
      holidayDates: [],
      initialMode: period.mode,
      showEstimatedIncome: true,
      incomeAgreements,
      hourlyRate: 100,
    }),
  );
}

describe("HistoryView estimated income", () => {
  it("hides income in a fixed month and shows it in a flexible month", () => {
    const agreements = [fixed, flexible];
    const label = "<span>estimatedincome</span>";

    expect(
      render(agreements, { mode: "month", month: "2026-02" }),
    ).not.toContain(label);
    expect(render(agreements, { mode: "month", month: "2026-05" })).toContain(
      label,
    );
  });

  it("shows income for a year that has flexible months", () => {
    const html = render([fixed, flexible], { mode: "year" });

    expect(html).toContain("<span>estimatedincome</span>");
    expect(html).toContain("<strong>0 SEK</strong>");
  });

  it("uses the extra income label for hybrid consultants", () => {
    expect(render([hybrid], { mode: "month", month: "2026-02" })).toContain(
      "<span>estimatedextraincome</span>",
    );
  });

  it("shows everything to admins and managers", () => {
    const html = render(undefined, { mode: "month", month: "2026-02" });

    expect(html).toContain("<span>estimatedincome</span>");
    expect(html).toContain("800 SEK");
  });
});
