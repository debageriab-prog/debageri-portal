import { describe, expect, it } from "vitest";
import {
  buildNotification,
  formatIsoWeek,
  notificationLocale,
  notificationSettingsFrom,
} from "@/domain/notifications";

const base = {
  recipientName: "Anna",
  organizationName: "Debageri",
  link: "https://portal.debageri.se/receipts",
};

describe("notification settings", () => {
  it("turns every topic on unless it is explicitly switched off", () => {
    expect(notificationSettingsFrom(undefined)).toEqual({
      receipts: true,
      payslips: true,
      timesheets: true,
    });
    expect(notificationSettingsFrom({ payslips: false })).toEqual({
      receipts: true,
      payslips: false,
      timesheets: true,
    });
  });
});

describe("notification emails", () => {
  it("writes receipt decisions in English with the comment and link", () => {
    const email = buildNotification("receiptRejected", "en-SE", {
      ...base,
      receiptName: "Taxi",
      receiptDate: "2026-10-01",
      amount: "125,00 kr",
      comment: "Missing VAT",
    });
    expect(email.subject).toBe("Your receipt was rejected: Taxi");
    expect(email.text).toContain("Hi Anna,");
    expect(email.text).toContain("Comment: Missing VAT");
    expect(email.text).toContain(base.link);
    expect(email.text).toMatch(/Debageri$/);
  });

  it("writes Swedish emails and leaves out an empty comment", () => {
    const email = buildNotification("payslipPublished", "sv-SE", {
      ...base,
      month: "september 2026",
      comment: "  ",
    });
    expect(email.subject).toBe("Ditt lönebesked för september 2026 finns nu");
    expect(email.text).toContain("Hej Anna,");
    expect(email.text).not.toContain("Kommentar");
  });

  it("keeps user text on one line so it cannot add headers or lines", () => {
    const email = buildNotification("receiptSubmitted", "en-SE", {
      ...base,
      personName: "Erik",
      receiptName: "Lunch\r\nBcc: someone@example.com",
      receiptDate: "2026-10-01",
      amount: "100,00 kr",
    });
    expect(email.subject).not.toMatch(/[\r\n]/);
  });

  it("formats weeks and falls back to English", () => {
    expect(formatIsoWeek("sv-SE", 2026, 3)).toBe("vecka 03 2026");
    expect(formatIsoWeek("en-SE", 2026, 43)).toBe("week 43, 2026");
    expect(notificationLocale("sv-SE")).toBe("sv-SE");
    expect(notificationLocale(undefined)).toBe("en-SE");
  });
});
