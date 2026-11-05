import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConsultantDashboard } from "@/app/time-reports/ConsultantDashboard";

vi.mock("@/components/localization/LocaleProvider", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

const consultant = (displayName: string, employmentEndDate: string | null) => ({
  id: displayName,
  displayName,
  reportingStartDate: "2026-01-01",
  employmentEndDate,
  role: "consultant",
  hourlyRate: 1000,
});

const leaver = consultant("Leaver", "2026-09-25");
const stayer = consultant("Stayer", null);
const other = consultant("Other", null);

function render(
  consultants: Array<ReturnType<typeof consultant>>,
  period: { mode: "year" | "month"; year?: number; month?: string },
) {
  return renderToStaticMarkup(
    createElement(ConsultantDashboard, {
      consultants,
      entries: [],
      holidayDates: [],
      period: {
        mode: period.mode,
        year: period.year ?? 2026,
        month: period.month ?? "2026-09",
      },
      showEstimatedIncome: true,
    }),
  );
}

describe("ConsultantDashboard", () => {
  it.each([
    { mode: "month", month: "2026-09" },
    { mode: "year", year: 2026 },
  ] as const)("shows a consultant up to their last day: %o", (period) => {
    expect(render([leaver, stayer], period)).toContain("<h2>Leaver</h2>");
  });

  it.each([
    { mode: "month", month: "2026-10" },
    { mode: "month", month: "2026-11" },
    { mode: "year", year: 2027 },
  ] as const)("hides a consultant after their last day: %o", (period) => {
    const html = render([leaver, stayer], period);

    expect(html).not.toContain("<h2>Leaver</h2>");
    expect(html).toContain("<h2>Stayer</h2>");
  });

  it("shows the total first when several consultants are listed", () => {
    const html = render([stayer, other], { mode: "month" });

    expect(html.indexOf("allConsultantsTotal")).toBeGreaterThan(-1);
    expect(html.indexOf("allConsultantsTotal")).toBeLessThan(
      html.indexOf("<h2>Stayer</h2>"),
    );
  });

  it("does not count a consultant who is hidden in the period", () => {
    expect(
      render([leaver, stayer, other], { mode: "month", month: "2026-10" }),
    ).toContain("allConsultantsTotal");
    expect(
      render([leaver, stayer], { mode: "month", month: "2026-10" }),
    ).not.toContain("allConsultantsTotal");
  });
});
