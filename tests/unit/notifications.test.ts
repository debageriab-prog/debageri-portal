import { describe, expect, it } from "vitest";
import en from "@/locales/en.json";
import sv from "@/locales/sv.json";
import {
  buildNotification,
  customEmailTemplate,
  defaultEmailTemplates,
  EMAIL_NOTIFICATION_KINDS,
  emailPlaceholders,
  fill,
  formatIsoWeek,
  IN_APP_NOTIFICATION_KINDS,
  isEmailKind,
  notificationLocale,
  notificationSettingsFrom,
  notificationValuesFor,
  NOTIFICATION_LOCALES,
} from "@/domain/notifications";
import { emailTemplateSchema } from "@/server/validators/reminder";

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

describe("in-app notifications", () => {
  it("has a title for every kind in both languages", () => {
    for (const kind of IN_APP_NOTIFICATION_KINDS) {
      const key = `notificationTitle_${kind}` as keyof typeof en;
      expect(en[key], key).toBeTruthy();
      expect(sv[key as keyof typeof sv], key).toBeTruthy();
    }
  });

  it("renders stored facts in the reader's language", () => {
    const params = {
      personName: "Erik",
      isoYear: 2026,
      isoWeek: 43,
      amountMinor: 12_550,
      year: 2026,
      month: 9,
    };
    const english = notificationValuesFor(params, "en-SE");
    const swedish = notificationValuesFor(params, "sv-SE");
    expect(english.week).toBe("week 43, 2026");
    expect(swedish.week).toBe("vecka 43 2026");
    expect(english.month).toMatch(/September 2026/);
    expect(swedish.month).toMatch(/september 2026/);
    expect(swedish.amount).toMatch(/125,50/);
    expect(fill(en.notificationTitle_timesheetSubmitted, english)).toBe(
      "Erik submitted the time report for week 43, 2026",
    );
  });

  it("keeps manager approval requests in the app only", () => {
    expect(isEmailKind("timesheetSubmitted")).toBe(false);
    expect(isEmailKind("timesheetRejected")).toBe(true);
  });
});

describe("editable email templates", () => {
  it("only uses placeholders that are listed for admins", () => {
    for (const locale of NOTIFICATION_LOCALES)
      for (const kind of EMAIL_NOTIFICATION_KINDS) {
        const { subject, body } = defaultEmailTemplates[locale][kind];
        const used = [...`${subject} ${body}`.matchAll(/\{\{(\w+)\}\}/g)].map(
          (match) => match[1],
        );
        for (const name of used)
          expect(emailPlaceholders[kind], `${locale} ${kind}`).toContain(name);
      }
  });

  it("uses the admin's saved text and drops an empty comment line", () => {
    const stored = {
      receiptApproved: {
        "en-SE": {
          subject: "Approved: {{receiptName}}",
          body: "Hello {{recipientName}}\n\n{{commentLine}}\n\nSee {{link}}",
        },
      },
    };
    const custom = customEmailTemplate(stored, "receiptApproved", "en-SE");
    const email = buildNotification(
      "receiptApproved",
      "en-SE",
      { ...base, receiptName: "Taxi" },
      custom,
    );
    expect(email.subject).toBe("Approved: Taxi");
    expect(email.text).toBe(`Hello Anna\n\nSee ${base.link}`);
    expect(customEmailTemplate(stored, "receiptApproved", "sv-SE")).toBeNull();
  });

  it("accepts notification templates per language and resets", () => {
    expect(
      emailTemplateSchema.safeParse({
        templateId: "payslipPublished",
        locale: "sv-SE",
        subject: "Lönebesked",
        template: "Hej {{recipientName}}",
      }).success,
    ).toBe(true);
    expect(
      emailTemplateSchema.safeParse({
        templateId: "payslipPublished",
        locale: "sv-SE",
        reset: true,
      }).success,
    ).toBe(true);
    expect(
      emailTemplateSchema.safeParse({
        templateId: "payslipPublished",
        subject: "x",
        template: "y",
      }).success,
    ).toBe(false);
  });
});
