import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HistoryView } from "@/app/employee/timesheets/HistoryView";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));
vi.mock("next/link", () => ({
  default: ({ href, ...props }: { href: string }) =>
    createElement("a", { href, ...props }),
}));
vi.mock("@/lib/firebase/client", () => ({ appCheckFetch: vi.fn() }));
vi.mock("@/components/timesheets/TimesheetAttachments", () => ({
  TimesheetAttachments: () => null,
}));
vi.mock("@/components/localization/LocaleProvider", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

const sheet = (status: string) => ({
  id: "sheet-1",
  isoYear: 2026,
  isoWeek: 44,
  part: 1,
  partCount: 1,
  periodStart: "2026-10-26",
  periodEnd: "2026-11-01",
  reportedMinutes: 2400,
  expectedMinutes: 2400,
  status,
});
const attachment = {
  id: "file-1",
  timesheetId: "sheet-1",
  name: "client-approval.pdf",
  contentType: "application/pdf",
};

function render(
  status: string,
  options: { attachments?: (typeof attachment)[]; readOnly?: boolean } = {},
) {
  return renderToStaticMarkup(
    createElement(HistoryView, {
      sheets: [sheet(status)],
      entries: [],
      currentYear: 2026,
      currentWeek: 44,
      currentMonth: "2026-11",
      reportingStartDate: null,
      employmentEndDate: null,
      holidayDates: [],
      ...options,
    }),
  );
}

describe("HistoryView row actions", () => {
  it("offers the edit pen on a rejected report", () => {
    expect(render("rejected")).toContain('aria-label="edit"');
  });

  it("offers only details on an approved report", () => {
    const html = render("approved");
    expect(html).toContain('aria-label="viewDetails"');
    expect(html).not.toContain('aria-label="edit"');
    expect(html).not.toContain('aria-label="delete"');
  });

  it("no longer links a sent report back to the reporting page", () => {
    expect(render("submitted")).not.toContain("/employee/timesheets/current");
  });
});

describe("HistoryView files column", () => {
  it("lists a report's files with a preview button", () => {
    const html = render("approved", { attachments: [attachment] });
    expect(html).toContain("<th>attachments</th>");
    expect(html).toContain("client-approval.pdf");
    expect(html).toContain('aria-label="previewAttachment"');
  });

  it("ignores files that belong to another report", () => {
    const html = render("approved", {
      attachments: [{ ...attachment, timesheetId: "sheet-2" }],
    });
    expect(html).not.toContain("client-approval.pdf");
  });

  it("is hidden when no attachment list is passed", () => {
    expect(render("approved", { readOnly: true })).not.toContain(
      "<th>attachments</th>",
    );
  });
});
