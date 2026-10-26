import { formatSek } from "@/domain/finance/calculations";
import { formatPayslipMonth } from "@/domain/payslips";

export type NotificationKind =
  | "receiptSubmitted"
  | "receiptApproved"
  | "receiptRejected"
  | "payslipPublished"
  | "timesheetApproved"
  | "timesheetRejected";

export const EMAIL_NOTIFICATION_KINDS: NotificationKind[] = [
  "receiptSubmitted",
  "receiptApproved",
  "receiptRejected",
  "payslipPublished",
  "timesheetApproved",
  "timesheetRejected",
];

/** Every kind shown in the portal; only `NotificationKind`s are emailed. */
export type InAppNotificationKind = NotificationKind | "timesheetSubmitted";

export const IN_APP_NOTIFICATION_KINDS: InAppNotificationKind[] = [
  "receiptSubmitted",
  "receiptApproved",
  "receiptRejected",
  "payslipPublished",
  "timesheetSubmitted",
  "timesheetApproved",
  "timesheetRejected",
];

export function isEmailKind(
  kind: InAppNotificationKind,
): kind is NotificationKind {
  return kind !== "timesheetSubmitted";
}

/** Raw facts stored with a notification and rendered per reader locale. */
export type NotificationParams = {
  personName?: string;
  receiptName?: string;
  receiptDate?: string;
  amountMinor?: number;
  comment?: string;
  year?: number;
  month?: number;
  isoYear?: number;
  isoWeek?: number;
};

export type NotificationTopic = "receipts" | "payslips" | "timesheets";
export type NotificationLocale = "sv-SE" | "en-SE";
export type NotificationSettings = Record<NotificationTopic, boolean>;

export const NOTIFICATION_LOCALES: NotificationLocale[] = ["en-SE", "sv-SE"];

export const NOTIFICATION_TOPICS: NotificationTopic[] = [
  "receipts",
  "payslips",
  "timesheets",
];

export const notificationTopic: Record<NotificationKind, NotificationTopic> = {
  receiptSubmitted: "receipts",
  receiptApproved: "receipts",
  receiptRejected: "receipts",
  payslipPublished: "payslips",
  timesheetApproved: "timesheets",
  timesheetRejected: "timesheets",
};

/** Every notification type is on unless an admin has switched it off. */
export function notificationSettingsFrom(value: unknown): NotificationSettings {
  const stored =
    value && typeof value === "object"
      ? (value as Partial<Record<NotificationTopic, unknown>>)
      : {};
  return {
    receipts: stored.receipts !== false,
    payslips: stored.payslips !== false,
    timesheets: stored.timesheets !== false,
  };
}

export type NotificationValues = {
  recipientName: string;
  organizationName: string;
  link: string;
  personName?: string;
  receiptName?: string;
  receiptDate?: string;
  amount?: string;
  comment?: string;
  month?: string;
  week?: string;
};

export type EmailTemplate = { subject: string; body: string };

const greeting: Record<NotificationLocale, string> = {
  "en-SE": "Hi {{recipientName}},",
  "sv-SE": "Hej {{recipientName}},",
};

const signOff: Record<NotificationLocale, string> = {
  "en-SE": [
    "Open the portal: {{link}}",
    "",
    "Best regards,",
    "{{organizationName}}",
  ].join("\n"),
  "sv-SE": [
    "Öppna portalen: {{link}}",
    "",
    "Vänliga hälsningar,",
    "{{organizationName}}",
  ].join("\n"),
};

function emailBody(locale: NotificationLocale, ...paragraphs: string[]) {
  return [greeting[locale], ...paragraphs, signOff[locale]].join("\n\n");
}

/** Built-in email texts, used until an admin saves their own version. */
export const defaultEmailTemplates: Record<
  NotificationLocale,
  Record<NotificationKind, EmailTemplate>
> = {
  "en-SE": {
    receiptSubmitted: {
      subject: "Receipt waiting for approval: {{receiptName}}",
      body: emailBody(
        "en-SE",
        '{{personName}} has submitted the receipt "{{receiptName}}" dated {{receiptDate}} for {{amount}}. It is waiting for your approval.',
      ),
    },
    receiptApproved: {
      subject: "Your receipt was approved: {{receiptName}}",
      body: emailBody(
        "en-SE",
        'Your receipt "{{receiptName}}" dated {{receiptDate}} for {{amount}} has been approved.',
        "{{commentLine}}",
      ),
    },
    receiptRejected: {
      subject: "Your receipt was rejected: {{receiptName}}",
      body: emailBody(
        "en-SE",
        'Your receipt "{{receiptName}}" dated {{receiptDate}} for {{amount}} has been rejected.',
        "{{commentLine}}",
      ),
    },
    payslipPublished: {
      subject: "Your pay slip for {{month}} is available",
      body: emailBody(
        "en-SE",
        "Your pay slip for {{month}} is now available in the portal.",
      ),
    },
    timesheetApproved: {
      subject: "Your time report for {{week}} was approved",
      body: emailBody(
        "en-SE",
        "Your time report for {{week}} has been approved.",
      ),
    },
    timesheetRejected: {
      subject: "Your time report for {{week}} was rejected",
      body: emailBody(
        "en-SE",
        "Your time report for {{week}} has been rejected. Please correct it and submit it again.",
        "{{commentLine}}",
      ),
    },
  },
  "sv-SE": {
    receiptSubmitted: {
      subject: "Kvitto väntar på godkännande: {{receiptName}}",
      body: emailBody(
        "sv-SE",
        '{{personName}} har skickat kvittot "{{receiptName}}" daterat {{receiptDate}} på {{amount}}. Det väntar på ditt godkännande.',
      ),
    },
    receiptApproved: {
      subject: "Ditt kvitto har godkänts: {{receiptName}}",
      body: emailBody(
        "sv-SE",
        'Ditt kvitto "{{receiptName}}" daterat {{receiptDate}} på {{amount}} har godkänts.',
        "{{commentLine}}",
      ),
    },
    receiptRejected: {
      subject: "Ditt kvitto har avslagits: {{receiptName}}",
      body: emailBody(
        "sv-SE",
        'Ditt kvitto "{{receiptName}}" daterat {{receiptDate}} på {{amount}} har avslagits.',
        "{{commentLine}}",
      ),
    },
    payslipPublished: {
      subject: "Ditt lönebesked för {{month}} finns nu",
      body: emailBody(
        "sv-SE",
        "Ditt lönebesked för {{month}} finns nu i portalen.",
      ),
    },
    timesheetApproved: {
      subject: "Din tidrapport för {{week}} har godkänts",
      body: emailBody("sv-SE", "Din tidrapport för {{week}} har godkänts."),
    },
    timesheetRejected: {
      subject: "Din tidrapport för {{week}} har avslagits",
      body: emailBody(
        "sv-SE",
        "Din tidrapport för {{week}} har avslagits. Rätta den och skicka in den igen.",
        "{{commentLine}}",
      ),
    },
  },
};

const commonPlaceholders = ["recipientName", "organizationName", "link"];
const receiptPlaceholders = ["receiptName", "receiptDate", "amount"];
const commentPlaceholders = ["comment", "commentLine"];

/** Placeholders an admin can use in each email template. */
export const emailPlaceholders: Record<NotificationKind, string[]> = {
  receiptSubmitted: [
    ...commonPlaceholders,
    "personName",
    ...receiptPlaceholders,
  ],
  receiptApproved: [
    ...commonPlaceholders,
    ...receiptPlaceholders,
    ...commentPlaceholders,
  ],
  receiptRejected: [
    ...commonPlaceholders,
    ...receiptPlaceholders,
    ...commentPlaceholders,
  ],
  payslipPublished: [...commonPlaceholders, "month"],
  timesheetApproved: [...commonPlaceholders, "week"],
  timesheetRejected: [...commonPlaceholders, "week", ...commentPlaceholders],
};

const commentLabel: Record<NotificationLocale, string> = {
  "en-SE": "Comment",
  "sv-SE": "Kommentar",
};

/**
 * Replaces `{{placeholder}}`s. Values are flattened to one line so user
 * text cannot add lines or headers, and blank lines left by a missing
 * comment are collapsed.
 */
export function renderEmailTemplate(
  template: string,
  values: Record<string, string | undefined>,
) {
  return template
    .replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      const value = values[key];
      return value === undefined ? match : value.replace(/[\r\n]+/g, " ");
    })
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function notificationValuesFor(
  params: NotificationParams,
  locale: NotificationLocale,
) {
  return {
    personName: params.personName,
    receiptName: params.receiptName,
    receiptDate: params.receiptDate,
    comment: params.comment,
    amount:
      params.amountMinor === undefined
        ? undefined
        : formatSek(params.amountMinor, locale),
    month:
      params.year && params.month
        ? formatPayslipMonth(locale, params.year, params.month)
        : undefined,
    week:
      params.isoYear && params.isoWeek
        ? formatIsoWeek(locale, params.isoYear, params.isoWeek)
        : undefined,
  };
}

/** Fills `{placeholder}`s in the in-app notification texts. */
export function fill(
  template: string,
  values: Partial<Record<keyof NotificationValues, string | undefined>>,
) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key as keyof NotificationValues];
    return value === undefined ? match : value.replace(/[\r\n]+/g, " ");
  });
}

export function notificationLocale(value: unknown): NotificationLocale {
  return value === "sv-SE" ? "sv-SE" : "en-SE";
}

export function formatIsoWeek(
  locale: NotificationLocale,
  isoYear: number,
  isoWeek: number,
) {
  const week = String(isoWeek).padStart(2, "0");
  return locale === "sv-SE"
    ? `vecka ${week} ${isoYear}`
    : `week ${week}, ${isoYear}`;
}

/**
 * Plain-text email in the recipient's language, using an admin's saved
 * template when there is one.
 */
export function buildNotification(
  kind: NotificationKind,
  locale: NotificationLocale,
  values: NotificationValues,
  custom?: Partial<EmailTemplate> | null,
) {
  const fallback = defaultEmailTemplates[locale][kind];
  const comment = values.comment?.trim() ?? "";
  const all: Record<string, string | undefined> = {
    ...values,
    comment,
    commentLine: comment ? `${commentLabel[locale]}: ${comment}` : "",
  };
  return {
    subject: renderEmailTemplate(custom?.subject || fallback.subject, all),
    text: renderEmailTemplate(custom?.body || fallback.body, all),
  };
}

/** Reads an admin's saved template for one kind and language, if any. */
export function customEmailTemplate(
  stored: unknown,
  kind: NotificationKind,
  locale: NotificationLocale,
): EmailTemplate | null {
  const value = (
    stored as Record<string, Record<string, Partial<EmailTemplate>>> | undefined
  )?.[kind]?.[locale];
  return value?.subject && value?.body
    ? { subject: String(value.subject), body: String(value.body) }
    : null;
}
