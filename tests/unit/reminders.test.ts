import { describe, expect, it } from "vitest";
import {
  findMissingWeeks,
  listedInReminderOverview,
  receivesReminders,
} from "@/domain/reminders/missing-weeks";
import {
  countsCurrentWeek,
  dueAutoReminders,
  normalizeAutoReminders,
} from "@/domain/reminders/schedule";
import { stockholmDateTime } from "@/lib/dates/stockholm";
import { isAuthorizedCronRequest } from "@/server/security/cron-auth";
import {
  emailNotificationsSchema,
  emailSettingsSchema,
  emailTemplateSchema,
  sendReminderSchema,
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

  it("stops counting weeks after the employment end date", () => {
    expect(
      findMissingWeeks("2026-07-06", "2026-08-26", [], {
        employmentEndDate: "2026-07-15",
      }),
    ).toEqual([
      { isoYear: 2026, isoWeek: 28 },
      { isoYear: 2026, isoWeek: 29 },
    ]);
  });

  it("counts the final week once the employment ended earlier this week", () => {
    // Week 29 of 2026 runs from 13 to 19 July.
    expect(
      findMissingWeeks("2026-07-13", "2026-07-16", [], {
        employmentEndDate: "2026-07-15",
      }),
    ).toEqual([{ isoYear: 2026, isoWeek: 29 }]);
    expect(
      findMissingWeeks("2026-07-13", "2026-07-15", [], {
        employmentEndDate: "2026-07-15",
      }),
    ).toEqual([]);
  });

  it("does not expect a month part that starts after the end date", () => {
    // Week 31 of 2026 runs from 27 July to 2 August.
    expect(
      findMissingWeeks(
        "2026-07-27",
        "2026-08-20",
        [
          {
            isoYear: 2026,
            isoWeek: 31,
            status: "approved",
            part: 1,
            partCount: 2,
          },
        ],
        { employmentEndDate: "2026-07-31" },
      ),
    ).toEqual([]);
  });

  it("keeps a former consultant listed only while weeks are missing", () => {
    const week = { isoYear: 2026, isoWeek: 29 };
    expect(listedInReminderOverview("2026-07-15", "2026-08-01", [])).toBe(
      false,
    );
    expect(listedInReminderOverview("2026-07-15", "2026-08-01", [week])).toBe(
      true,
    );
    expect(listedInReminderOverview("2026-08-01", "2026-08-01", [])).toBe(true);
    expect(listedInReminderOverview(null, "2026-08-01", [])).toBe(true);
  });

  it("includes the current week for end-of-period reminders", () => {
    const reports = [{ isoYear: 2026, isoWeek: 30, status: "approved" }];
    expect(
      findMissingWeeks("2026-07-20", "2026-07-31", reports, {
        includeCurrentWeek: true,
      }),
    ).toEqual([{ isoYear: 2026, isoWeek: 31 }]);
    expect(
      findMissingWeeks("2026-07-20", "2026-07-31", [
        ...reports,
        { isoYear: 2026, isoWeek: 31, status: "submitted" },
      ]),
    ).toEqual([]);
  });

  it("requires every started part of a week that spans two months", () => {
    const firstPart = {
      isoYear: 2026,
      isoWeek: 31,
      status: "submitted",
      part: 1,
      partCount: 2,
    };
    // Week 31 of 2026 runs from 27 July to 2 August.
    expect(findMissingWeeks("2026-07-27", "2026-08-05", [firstPart])).toEqual([
      { isoYear: 2026, isoWeek: 31 },
    ]);
    expect(
      findMissingWeeks("2026-07-27", "2026-08-05", [
        firstPart,
        { ...firstPart, part: 2 },
      ]),
    ).toEqual([]);
    expect(
      findMissingWeeks("2026-07-27", "2026-07-31", [firstPart], {
        includeCurrentWeek: true,
      }),
    ).toEqual([]);
  });

  it("leaves inactive users and other roles out of reminders", () => {
    expect(receivesReminders({ role: "consultant", status: "active" })).toBe(
      true,
    );
    expect(receivesReminders({ role: "employee" })).toBe(true);
    expect(receivesReminders({ role: "consultant", status: "inactive" })).toBe(
      false,
    );
    expect(receivesReminders({ role: "admin", status: "active" })).toBe(false);
  });

  it("keeps every automatic reminder off by default", () => {
    expect(normalizeAutoReminders(undefined)).toEqual({
      firstWorkingDayOfWeek: false,
      lastWorkingDayOfWeek: false,
      firstWorkingDayOfMonth: false,
      lastWorkingDayOfMonth: false,
    });
  });

  it("finds due automatic reminders by working day and hour", () => {
    const all = {
      firstWorkingDayOfWeek: true,
      lastWorkingDayOfWeek: true,
      firstWorkingDayOfMonth: true,
      lastWorkingDayOfMonth: true,
    };
    const none = new Set<string>();
    // Monday 3 August 2026 opens both the week and the month.
    expect(dueAutoReminders(all, "2026-08-03", 9, none)).toEqual([
      "firstWorkingDayOfWeek",
      "firstWorkingDayOfMonth",
    ]);
    expect(dueAutoReminders(all, "2026-08-03", 17, none)).toEqual([]);
    // Friday 31 July 2026 closes both the week and the month.
    expect(dueAutoReminders(all, "2026-07-31", 17, none)).toEqual([
      "lastWorkingDayOfWeek",
      "lastWorkingDayOfMonth",
    ]);
    // A red Monday moves the first working day to Tuesday.
    const redMonday = new Set(["2026-08-10"]);
    expect(dueAutoReminders(all, "2026-08-10", 9, redMonday)).toEqual([]);
    expect(dueAutoReminders(all, "2026-08-11", 9, redMonday)).toEqual([
      "firstWorkingDayOfWeek",
    ]);
    expect(
      dueAutoReminders(
        { ...all, firstWorkingDayOfWeek: false },
        "2026-08-11",
        9,
        redMonday,
      ),
    ).toEqual([]);
  });

  it("counts the current week on the last working day of a week or month", () => {
    const none = new Set<string>();
    // Friday 30 October 2026 closes the week; the month ends on Saturday.
    expect(countsCurrentWeek("2026-10-30", none)).toBe(true);
    expect(countsCurrentWeek("2026-10-29", none)).toBe(false);
    // Tuesday 30 June 2026 closes the month in the middle of a week.
    expect(countsCurrentWeek("2026-06-30", none)).toBe(true);
    // A red Friday moves the end of the week to Thursday.
    expect(countsCurrentWeek("2026-10-29", new Set(["2026-10-30"]))).toBe(true);
  });

  it("accepts one or several consultants for a manual reminder", () => {
    expect(sendReminderSchema.safeParse({ userIds: ["a", "b"] }).success).toBe(
      true,
    );
    expect(sendReminderSchema.safeParse({ userIds: [] }).success).toBe(false);
  });

  it("reads the date and hour in Stockholm", () => {
    expect(stockholmDateTime(new Date("2026-07-15T07:00:00Z"))).toEqual({
      date: "2026-07-15",
      hour: 9,
    });
    expect(stockholmDateTime(new Date("2026-01-15T16:00:00Z"))).toEqual({
      date: "2026-01-15",
      hour: 17,
    });
    expect(stockholmDateTime(new Date("2026-07-15T22:30:00Z"))).toEqual({
      date: "2026-07-16",
      hour: 0,
    });
  });

  it("only accepts the scheduler's secret", () => {
    expect(isAuthorizedCronRequest("Bearer secret", "secret")).toBe(true);
    expect(isAuthorizedCronRequest("Bearer other", "secret")).toBe(false);
    expect(isAuthorizedCronRequest(null, "secret")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer ", "")).toBe(false);
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

  it("saves notification switches without the SMTP connection", () => {
    expect(
      emailNotificationsSchema.safeParse({
        notifications: { receipts: true, payslips: false, timesheets: true },
      }).success,
    ).toBe(true);
    expect(
      emailNotificationsSchema.safeParse({ notifications: { receipts: true } })
        .success,
    ).toBe(false);
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
