import { describe, expect, it } from "vitest";
import { findMissingWeeks } from "@/domain/reminders/missing-weeks";
import {
  emailSettingsSchema,
  emailTemplateSchema,
} from "@/server/validators/reminder";

describe("time report reminders", () => {
  it("omits submitted and approved weeks and excludes the current week", () => {
    expect(
      findMissingWeeks("2026-07-06", "2026-07-29", [
        { isoYear: 2026, isoWeek: 28, status: "approved" },
        { isoYear: 2026, isoWeek: 29, status: "submitted" },
        { isoYear: 2026, isoWeek: 30, status: "draft" },
      ]),
    ).toEqual([{ isoYear: 2026, isoWeek: 30 }]);
  });

  it("validates email connection settings separately from templates", () => {
    expect(
      emailSettingsSchema.safeParse({
        smtpHost: "smtp.example.com",
        smtpPort: 587,
        smtpSecure: true,
        smtpUsername: "mailer@example.com",
        fromEmail: "mailer@example.com",
        senderName: "Example",
      }).success,
    ).toBe(true);
  });

  it("only accepts registered email template identifiers", () => {
    const template = { subject: "Reminder", template: "Hello" };
    expect(
      emailTemplateSchema.safeParse({
        templateId: "time-report-reminder",
        ...template,
      }).success,
    ).toBe(true);
    expect(
      emailTemplateSchema.safeParse({
        templateId: "unknown-template",
        ...template,
      }).success,
    ).toBe(false);
  });
});
