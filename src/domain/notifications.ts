import { formatSek } from "@/domain/finance/calculations";
import { formatPayslipMonth } from "@/domain/payslips";

export type NotificationKind =
  | "receiptSubmitted"
  | "receiptApproved"
  | "receiptRejected"
  | "payslipPublished"
  | "timesheetApproved"
  | "timesheetRejected";

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

type Template = { subject: string; body: string };

const templates: Record<
  NotificationLocale,
  Record<NotificationKind, Template> & { comment: string; signOff: string }
> = {
  "en-SE": {
    receiptSubmitted: {
      subject: "Receipt waiting for approval: {receiptName}",
      body: '{personName} has submitted the receipt "{receiptName}" dated {receiptDate} for {amount}. It is waiting for your approval.',
    },
    receiptApproved: {
      subject: "Your receipt was approved: {receiptName}",
      body: 'Your receipt "{receiptName}" dated {receiptDate} for {amount} has been approved.',
    },
    receiptRejected: {
      subject: "Your receipt was rejected: {receiptName}",
      body: 'Your receipt "{receiptName}" dated {receiptDate} for {amount} has been rejected.',
    },
    payslipPublished: {
      subject: "Your pay slip for {month} is available",
      body: "Your pay slip for {month} is now available in the portal.",
    },
    timesheetApproved: {
      subject: "Your time report for {week} was approved",
      body: "Your time report for {week} has been approved.",
    },
    timesheetRejected: {
      subject: "Your time report for {week} was rejected",
      body: "Your time report for {week} has been rejected. Please correct it and submit it again.",
    },
    comment: "Comment: {comment}",
    signOff: "Open the portal: {link}\n\nBest regards,\n{organizationName}",
  },
  "sv-SE": {
    receiptSubmitted: {
      subject: "Kvitto väntar på godkännande: {receiptName}",
      body: '{personName} har skickat kvittot "{receiptName}" daterat {receiptDate} på {amount}. Det väntar på ditt godkännande.',
    },
    receiptApproved: {
      subject: "Ditt kvitto har godkänts: {receiptName}",
      body: 'Ditt kvitto "{receiptName}" daterat {receiptDate} på {amount} har godkänts.',
    },
    receiptRejected: {
      subject: "Ditt kvitto har avslagits: {receiptName}",
      body: 'Ditt kvitto "{receiptName}" daterat {receiptDate} på {amount} har avslagits.',
    },
    payslipPublished: {
      subject: "Ditt lönebesked för {month} finns nu",
      body: "Ditt lönebesked för {month} finns nu i portalen.",
    },
    timesheetApproved: {
      subject: "Din tidrapport för {week} har godkänts",
      body: "Din tidrapport för {week} har godkänts.",
    },
    timesheetRejected: {
      subject: "Din tidrapport för {week} har avslagits",
      body: "Din tidrapport för {week} har avslagits. Rätta den och skicka in den igen.",
    },
    comment: "Kommentar: {comment}",
    signOff:
      "Öppna portalen: {link}\n\nVänliga hälsningar,\n{organizationName}",
  },
};

const greetings: Record<NotificationLocale, string> = {
  "en-SE": "Hi {recipientName},",
  "sv-SE": "Hej {recipientName},",
};

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

/** Plain-text email in the recipient's language. */
export function buildNotification(
  kind: NotificationKind,
  locale: NotificationLocale,
  values: NotificationValues,
) {
  const set = templates[locale];
  const comment = values.comment?.trim();
  const body = [
    fill(greetings[locale], values),
    fill(set[kind].body, values),
    ...(comment ? [fill(set.comment, { ...values, comment })] : []),
    fill(set.signOff, values),
  ].join("\n\n");
  return { subject: fill(set[kind].subject, values), text: body };
}
