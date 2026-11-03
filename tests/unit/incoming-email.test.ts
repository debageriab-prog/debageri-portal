import { describe, expect, it } from "vitest";
import {
  attachmentContentType,
  canApplyIncomingEmailAction,
  canConvertIncomingEmail,
  dmarcFailed,
  emailAddress,
  emailBodyText,
  incomingEmailKind,
  isTrustedSender,
  type IncomingEmailRunSummary,
  MAX_INCOMING_ATTACHMENT_BYTES,
  MAX_INCOMING_BODY_CHARS,
  MAX_REPORTED_SENDERS,
  recordSkip,
  selectAttachments,
} from "@/domain/incoming-email";
import {
  incomingEmailConnectionSchema,
  incomingEmailSettingsSchema,
} from "@/server/validators/incoming-email";

const file = (name: string, contentType: string, size = 1_000) => ({
  name,
  contentType,
  size,
});

describe("trusted senders", () => {
  it("reads the address from a display name", () => {
    expect(emailAddress('"Anna Berg" <Anna.Berg@Example.se>')).toBe(
      "anna.berg@example.se",
    );
    expect(emailAddress("ANNA@example.se")).toBe("anna@example.se");
    expect(emailAddress("not an address")).toBeNull();
  });

  it("only trusts listed addresses, ignoring case", () => {
    const trusted = ["anna@example.se"];
    expect(isTrustedSender("Anna <ANNA@example.se>", trusted)).toBe(true);
    expect(isTrustedSender("anna@example.se.evil.com", trusted)).toBe(false);
    expect(isTrustedSender("bob@example.se", trusted)).toBe(false);
    expect(isTrustedSender("", trusted)).toBe(false);
  });

  it("spots forged senders from the receiving server's DMARC result", () => {
    expect(dmarcFailed("mx.google.com; dkim=pass; spf=pass; dmarc=pass")).toBe(
      false,
    );
    expect(dmarcFailed(["spf=pass", "mx; dmarc=fail (p=NONE)"])).toBe(true);
    expect(dmarcFailed([])).toBe(false);
  });
});

describe("attachments", () => {
  it("trusts the extension when the type is generic", () => {
    expect(
      attachmentContentType("kvitto.PDF", "application/octet-stream"),
    ).toBe("application/pdf");
    expect(attachmentContentType("a.jpg", "image/jpeg; name=a.jpg")).toBe(
      "image/jpeg",
    );
  });

  it("keeps documents and images within the limits, at most three", () => {
    const { kept, skipped } = selectAttachments([
      file("logo.gif", "image/gif"),
      file("a.pdf", "application/pdf"),
      file("b.png", "image/png"),
      file("huge.pdf", "application/pdf", MAX_INCOMING_ATTACHMENT_BYTES + 1),
      file("c.pdf", "application/octet-stream"),
      file("d.webp", "image/webp"),
      file("original.eml", "message/rfc822"),
    ]);
    expect(kept.map((item) => item.name)).toEqual(["a.pdf", "b.png", "c.pdf"]);
    expect(kept[2]!.contentType).toBe("application/pdf");
    expect(skipped).toBe(4);
  });

  it("keeps a forwarded email only when nothing else is attached", () => {
    expect(
      selectAttachments([file("original.eml", "message/rfc822")]).kept,
    ).toHaveLength(1);
  });
});

describe("email body", () => {
  it("prefers plain text and reduces HTML to text", () => {
    expect(emailBodyText("  Hello\n\n\n\nthere  ")).toBe("Hello\n\nthere");
    expect(
      emailBodyText(
        undefined,
        "<style>p{}</style><p>Total&nbsp;125 kr</p><div>Moms 25 kr</div>",
      ),
    ).toBe("Total 125 kr\n Moms 25 kr");
    expect(
      emailBodyText("x".repeat(MAX_INCOMING_BODY_CHARS + 10)),
    ).toHaveLength(MAX_INCOMING_BODY_CHARS);
  });
});

describe("kind", () => {
  it("turns a sales invoice into an invoice and the rest into transactions", () => {
    expect(
      incomingEmailKind({ documentType: "invoice", direction: "income" }),
    ).toBe("invoice");
    expect(
      incomingEmailKind({ documentType: "invoice", direction: "expense" }),
    ).toBe("transaction");
    expect(
      incomingEmailKind({ documentType: "receipt", direction: null }),
    ).toBe("transaction");
    expect(incomingEmailKind({ documentType: "other", direction: null })).toBe(
      "unknown",
    );
    expect(
      incomingEmailKind({ documentType: "vatDocument", direction: null }),
    ).toBe("unknown");
  });
});

describe("status", () => {
  it("allows only waiting emails to be created, dismissed or read again", () => {
    expect(canConvertIncomingEmail("ready")).toBe(true);
    expect(canConvertIncomingEmail("failed")).toBe(true);
    expect(canConvertIncomingEmail("converted")).toBe(false);
    expect(canConvertIncomingEmail("dismissed")).toBe(false);
    expect(canApplyIncomingEmailAction("ready", "dismiss")).toBe(true);
    expect(canApplyIncomingEmailAction("converted", "retry")).toBe(false);
    expect(canApplyIncomingEmailAction("dismissed", "restore")).toBe(true);
    expect(canApplyIncomingEmailAction("ready", "restore")).toBe(false);
  });
});

describe("settings validation", () => {
  const settings = {
    enabled: true,
    imapHost: "imap.example.se",
    imapPort: 993,
    imapSecure: true,
    imapUsername: "ekonomi@example.se",
    folder: "INBOX",
    trustedSenders: [" Anna@Example.se "],
  };

  it("lowercases trusted senders and keeps the password optional", () => {
    const parsed = incomingEmailSettingsSchema.parse(settings);
    expect(parsed.trustedSenders).toEqual(["anna@example.se"]);
    expect(parsed.password).toBeUndefined();
  });

  it("rejects duplicate or invalid senders and bad ports", () => {
    expect(
      incomingEmailSettingsSchema.safeParse({
        ...settings,
        trustedSenders: ["a@example.se", "A@example.se"],
      }).success,
    ).toBe(false);
    expect(
      incomingEmailSettingsSchema.safeParse({
        ...settings,
        trustedSenders: ["nope"],
      }).success,
    ).toBe(false);
    expect(
      incomingEmailConnectionSchema.safeParse({ ...settings, imapPort: 0 })
        .success,
    ).toBe(false);
  });
});

describe("run summary", () => {
  it("counts skips by reason and lists a few untrusted senders", () => {
    const summary: IncomingEmailRunSummary = {
      read: 0,
      stored: 0,
      skipped: 0,
      failed: 0,
    };
    recordSkip(summary, "untrustedSender", "a@example.se");
    recordSkip(summary, "untrustedSender", "a@example.se");
    recordSkip(summary, "senderCheckFailed", "b@example.se");
    for (let index = 0; index < MAX_REPORTED_SENDERS + 2; index += 1)
      recordSkip(summary, "untrustedSender", `x${index}@example.se`);
    expect(summary.skipped).toBe(MAX_REPORTED_SENDERS + 5);
    expect(summary.skippedBy).toEqual({
      untrustedSender: MAX_REPORTED_SENDERS + 4,
      senderCheckFailed: 1,
    });
    expect(summary.untrustedSenders).toHaveLength(MAX_REPORTED_SENDERS);
    expect(summary.untrustedSenders![0]).toBe("a@example.se");
  });
});
