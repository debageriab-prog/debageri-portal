import type { FinanceExtraction } from "@/domain/ai";

/**
 * Emails forwarded to the finance mailbox wait for review. `ready` holds
 * what the AI read, `failed` could not be read (and may be retried),
 * `converted` became a transaction or invoice, `dismissed` was set aside.
 */
export const INCOMING_EMAIL_STATUSES = [
  "ready",
  "failed",
  "converted",
  "dismissed",
] as const;
export type IncomingEmailStatus = (typeof INCOMING_EMAIL_STATUSES)[number];

export function isIncomingEmailStatus(
  value: unknown,
): value is IncomingEmailStatus {
  return (INCOMING_EMAIL_STATUSES as readonly unknown[]).includes(value);
}

/** What an email can become; more entities may follow. */
export type IncomingEmailKind = "transaction" | "invoice" | "unknown";

export type IncomingEmailAction = "dismiss" | "restore" | "retry";

export const MAX_TRUSTED_SENDERS = 50;
/** Matches what a transaction or invoice can carry. */
export const MAX_INCOMING_ATTACHMENTS = 3;
export const MAX_INCOMING_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_INCOMING_BODY_CHARS = 20_000;
/** Messages read per run; each may wait on the AI, so one run stays inside a request timeout. */
export const INCOMING_EMAIL_BATCH = 10;

export type IncomingEmailAttachment = {
  id: string;
  name: string;
  size: number;
  contentType: string;
  storagePath: string;
};

export type IncomingEmailRunSummary = {
  read: number;
  stored: number;
  skipped: number;
  failed: number;
};

/** The lower-case address in `Name <address>` or a bare address. */
export function emailAddress(value: string | null | undefined) {
  const match = /<([^<>\s]+@[^<>\s]+)>/.exec(value ?? "");
  const address = (match?.[1] ?? value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? address : null;
}

export function isTrustedSender(from: string, trustedSenders: string[]) {
  const address = emailAddress(from);
  return (
    address !== null &&
    trustedSenders.some((sender) => emailAddress(sender) === address)
  );
}

/**
 * True when the receiving server says the sender's domain failed DMARC,
 * which means the From address was most likely forged.
 */
export function dmarcFailed(authenticationResults: string | string[] = []) {
  return [authenticationResults]
    .flat()
    .some((header) => /\bdmarc\s*=\s*fail\b/i.test(header));
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const EXTENSION_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  eml: "message/rfc822",
};

/** Mail clients often send PDFs as octet-stream; trust the extension then. */
export function attachmentContentType(name: string, contentType: string) {
  const type = (contentType.toLowerCase().split(";")[0] ?? "").trim();
  if (type === "application/pdf" || IMAGE_TYPES.includes(type)) return type;
  if (type === "message/rfc822") return type;
  const extension = name.toLowerCase().split(".").pop() ?? "";
  return EXTENSION_TYPES[extension] ?? type;
}

/**
 * The attachments worth keeping: PDFs and images within the size limit,
 * at most three. A forwarded .eml is kept only when nothing else is, since
 * it usually just repeats the email.
 */
export function selectAttachments<
  T extends { name: string; contentType: string; size: number },
>(files: T[]) {
  const typed = files.map((file) => ({
    ...file,
    contentType: attachmentContentType(file.name, file.contentType),
  }));
  const fits = (file: T) =>
    file.size > 0 && file.size <= MAX_INCOMING_ATTACHMENT_BYTES;
  const documents = typed.filter(
    (file) =>
      fits(file) &&
      (file.contentType === "application/pdf" ||
        IMAGE_TYPES.includes(file.contentType)),
  );
  const candidates = documents.length
    ? documents
    : typed.filter(
        (file) => fits(file) && file.contentType === "message/rfc822",
      );
  const kept = candidates.slice(0, MAX_INCOMING_ATTACHMENTS);
  return { kept, skipped: files.length - kept.length };
}

/**
 * A customer invoice the company issued becomes an invoice; receipts,
 * supplier invoices and other money in or out become a transaction.
 */
export function incomingEmailKind(
  extraction: Pick<FinanceExtraction, "documentType" | "direction">,
): IncomingEmailKind {
  if (
    extraction.documentType === "invoice" &&
    extraction.direction === "income"
  )
    return "invoice";
  if (extraction.documentType === "vatDocument") return "unknown";
  if (extraction.direction || extraction.documentType !== "other")
    return "transaction";
  return "unknown";
}

/** Waiting items can be turned into a record or set aside. */
export const canConvertIncomingEmail = (status: IncomingEmailStatus) =>
  status === "ready" || status === "failed";

export function canApplyIncomingEmailAction(
  status: IncomingEmailStatus,
  action: IncomingEmailAction,
) {
  if (action === "restore") return status === "dismissed";
  return canConvertIncomingEmail(status);
}

/** Plain text of an email body, with HTML reduced to its text. */
export function emailBodyText(text: string | undefined, html?: string | false) {
  const source =
    text?.trim() ||
    (html || "")
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  return source
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim()
    .slice(0, MAX_INCOMING_BODY_CHARS);
}
