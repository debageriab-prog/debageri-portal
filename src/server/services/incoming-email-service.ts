import "server-only";

import { randomUUID } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Storage } from "firebase-admin/storage";
import type { z } from "zod";
import { can } from "@/domain/access/permissions";
import type { FinanceExtraction } from "@/domain/ai";
import {
  canApplyIncomingEmailAction,
  canConvertIncomingEmail,
  dmarcFailed,
  emailAddress,
  emailBodyText,
  INCOMING_EMAIL_BATCH,
  incomingEmailKind,
  isIncomingEmailStatus,
  isTrustedSender,
  recordSkip,
  selectAttachments,
  type IncomingEmailAction,
  type IncomingEmailAttachment,
  type IncomingEmailKind,
  type IncomingEmailRunSummary,
  type IncomingSkipReason,
  type IncomingEmailStatus,
} from "@/domain/incoming-email";
import type { PortalUser } from "@/domain/types";
import {
  AiError,
  extractFinanceInput,
  isAiFeatureEnabled,
  type ExtractionFile,
} from "@/server/services/ai-service";
import {
  decryptPassword,
  encryptPassword,
} from "@/server/services/reminder-service";
import type {
  incomingEmailConnectionSchema,
  incomingEmailSettingsSchema,
} from "@/server/validators/incoming-email";

const SETTINGS = "incomingEmailSettings";
const EMAILS = "incomingFinanceEmails";
/** Long enough for a full batch; a crashed run frees the mailbox after it. */
const LEASE_MS = 10 * 60_000;
/** Larger messages are left alone rather than downloaded. */
const MAX_MESSAGE_BYTES = 40 * 1024 * 1024;
/** How far back the first read of a mailbox looks. */
const FIRST_READ_DAYS = 14;

export class IncomingEmailError extends Error {
  constructor(
    public code:
      | "forbidden"
      | "notFound"
      | "incomingEmailDisabled"
      | "incomingEmailBusy"
      | "incomingEmailInvalidState"
      | "incomingEmailAlreadyConverted"
      | "mailboxPasswordRequired"
      | "mailboxAuthFailed"
      | "mailboxFolderMissing"
      | "mailboxConnectionFailed",
    public status: number,
  ) {
    super(code);
  }
}

export type IncomingEmailSettingsView = {
  enabled: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUsername: string;
  passwordConfigured: boolean;
  folder: string;
  trustedSenders: string[];
  lastRunAt: string | null;
  lastRunSummary: IncomingEmailRunSummary | null;
  lastRunError: string | null;
};

function isoDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function settingsFrom(
  data: Record<string, unknown> | undefined,
): IncomingEmailSettingsView {
  return {
    enabled: data?.enabled === true,
    imapHost: String(data?.imapHost ?? ""),
    imapPort: Number(data?.imapPort ?? 993),
    imapSecure: data?.imapSecure !== false,
    imapUsername: String(data?.imapUsername ?? ""),
    passwordConfigured: Boolean(data?.encryptedPassword),
    folder: String(data?.folder ?? "INBOX"),
    trustedSenders: Array.isArray(data?.trustedSenders)
      ? data.trustedSenders.map(String)
      : [],
    lastRunAt: isoDate(data?.lastRunAt),
    lastRunSummary:
      (data?.lastRunSummary as IncomingEmailRunSummary | undefined) ?? null,
    lastRunError:
      typeof data?.lastRunError === "string" ? data.lastRunError : null,
  };
}

export async function readIncomingEmailSettings(
  db: Firestore,
  organizationId: string,
) {
  return settingsFrom(
    (await db.collection(SETTINGS).doc(organizationId).get()).data(),
  );
}

/** Whether the mailbox is set up and switched on, and whether AI may read it. */
export async function incomingEmailAvailability(
  db: Firestore,
  organizationId: string,
) {
  const [settings, ai] = await Promise.all([
    readIncomingEmailSettings(db, organizationId),
    isAiFeatureEnabled(db, organizationId, "financeIncomingEmails"),
  ]);
  return {
    mailbox:
      settings.enabled &&
      settings.passwordConfigured &&
      Boolean(settings.imapHost),
    ai,
  };
}

export async function saveIncomingEmailSettings(
  db: Firestore,
  actor: PortalUser,
  input: z.infer<typeof incomingEmailSettingsSchema>,
) {
  if (actor.role !== "admin") throw new IncomingEmailError("forbidden", 403);
  const ref = db.collection(SETTINGS).doc(actor.organizationId);
  const existing = (await ref.get()).data();
  if (!input.password && !existing?.encryptedPassword)
    throw new IncomingEmailError("mailboxPasswordRequired", 400);
  const { password, ...settings } = input;
  // Another mailbox or folder starts over from its recent messages.
  const moved =
    existing?.imapHost !== settings.imapHost ||
    existing?.imapUsername !== settings.imapUsername ||
    existing?.folder !== settings.folder;
  const batch = db.batch();
  batch.set(
    ref,
    {
      organizationId: actor.organizationId,
      ...settings,
      ...(password ? { encryptedPassword: encryptPassword(password) } : {}),
      ...(moved ? { uidValidity: null, lastUid: null } : {}),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.id,
    },
    { merge: true },
  );
  batch.create(db.collection("auditLogs").doc(), {
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action: "incomingEmailSettingsUpdated",
    entityType: "incomingEmailSettings",
    entityId: actor.organizationId,
    timestamp: FieldValue.serverTimestamp(),
    metadata: { ...settings, passwordChanged: Boolean(password) },
  });
  await batch.commit();
}

type Mailbox = {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUsername: string;
  password: string;
  folder: string;
};

function client(mailbox: Mailbox) {
  return new ImapFlow({
    host: mailbox.imapHost,
    port: mailbox.imapPort,
    secure: mailbox.imapSecure,
    auth: { user: mailbox.imapUsername, pass: mailbox.password },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
}

function connectionError(error: unknown) {
  const failure = error as { authenticationFailed?: boolean };
  console.warn("Incoming email mailbox connection failed", {
    errorClass: error instanceof Error ? error.name : "unknown",
    message: error instanceof Error ? error.message.slice(0, 200) : undefined,
  });
  return new IncomingEmailError(
    failure?.authenticationFailed
      ? "mailboxAuthFailed"
      : "mailboxConnectionFailed",
    502,
  );
}

/** Opens the folder, runs `work` and always closes the connection. */
async function withFolder<T>(
  mailbox: Mailbox,
  work: (connection: ImapFlow) => Promise<T>,
) {
  const connection = client(mailbox);
  connection.on("error", () => undefined);
  try {
    await connection.connect();
  } catch (error) {
    throw connectionError(error);
  }
  try {
    const lock = await connection.getMailboxLock(mailbox.folder).catch(() => {
      throw new IncomingEmailError("mailboxFolderMissing", 400);
    });
    try {
      return await work(connection);
    } finally {
      lock.release();
    }
  } finally {
    await connection.logout().catch(() => connection.close());
  }
}

export async function testIncomingEmailConnection(
  db: Firestore,
  actor: PortalUser,
  input: z.infer<typeof incomingEmailConnectionSchema>,
) {
  if (actor.role !== "admin") throw new IncomingEmailError("forbidden", 403);
  const stored = (
    await db.collection(SETTINGS).doc(actor.organizationId).get()
  ).data()?.encryptedPassword;
  const password =
    input.password ?? (stored ? decryptPassword(String(stored)) : null);
  if (!password) throw new IncomingEmailError("mailboxPasswordRequired", 400);
  await withFolder({ ...input, password }, async () => undefined);
}

/** Takes the mailbox for one run so a scheduled read and "Read now" never overlap. */
async function takeLease(db: Firestore, organizationId: string) {
  const ref = db.collection(SETTINGS).doc(organizationId);
  return db.runTransaction(async (transaction) => {
    const lockUntil = (await transaction.get(ref)).data()?.lockUntil;
    if (lockUntil instanceof Timestamp && lockUntil.toMillis() > Date.now())
      return false;
    transaction.update(ref, {
      lockUntil: Timestamp.fromMillis(Date.now() + LEASE_MS),
    });
    return true;
  });
}

type StoredOutcome =
  "stored" | "failed" | { skipped: IncomingSkipReason; sender?: string | null };

async function extract(
  db: Firestore,
  organizationId: string,
  files: ExtractionFile[],
  email: { from: string; subject: string; text: string },
) {
  try {
    const extraction = await extractFinanceInput(
      db,
      organizationId,
      { files, email },
      "incomingEmail",
    );
    return {
      status: "ready" as const,
      kind: incomingEmailKind(extraction),
      extraction,
      error: null,
    };
  } catch (error) {
    if (!(error instanceof AiError))
      console.error("Incoming email AI failed", error);
    return {
      status: "failed" as const,
      kind: "unknown" as const,
      extraction: null,
      error: error instanceof AiError ? error.code : "aiProviderFailed",
    };
  }
}

async function storeMessage(
  db: Firestore,
  storage: Storage,
  organizationId: string,
  trustedSenders: string[],
  source: Buffer,
  fallbackId: string,
): Promise<StoredOutcome> {
  const parsed = await simpleParser(source);
  const sender = parsed.from?.value[0]?.address ?? "";
  if (!isTrustedSender(sender, trustedSenders))
    return {
      skipped: "untrustedSender",
      sender: emailAddress(sender) ?? sender.slice(0, 254),
    };
  const authentication = parsed.headerLines
    .filter((line) => line.key === "authentication-results")
    .map((line) => line.line);
  if (dmarcFailed(authentication)) return { skipped: "senderCheckFailed" };
  const messageId = (parsed.messageId ?? fallbackId).slice(0, 500);
  const duplicate = await db
    .collection(EMAILS)
    .where("organizationId", "==", organizationId)
    .where("messageId", "==", messageId)
    .limit(1)
    .get();
  if (!duplicate.empty) return { skipped: "duplicate" };

  const { kept } = selectAttachments(
    parsed.attachments.map((attachment) => ({
      name: (attachment.filename ?? "attachment")
        .replace(/[\r\n]/g, "")
        .slice(0, 180),
      contentType: attachment.contentType,
      size: attachment.content.length,
      content: attachment.content,
    })),
  );
  const ref = db.collection(EMAILS).doc();
  const attachments: IncomingEmailAttachment[] = [];
  try {
    for (const file of kept) {
      const id = randomUUID();
      const storagePath = `organizations/${organizationId}/finance/incomingEmails/${ref.id}/${id}`;
      await storage
        .bucket()
        .file(storagePath)
        .save(file.content, {
          resumable: false,
          metadata: {
            contentType: file.contentType,
            cacheControl: "private, no-cache",
          },
        });
      attachments.push({
        id,
        name: file.name,
        size: file.size,
        contentType: file.contentType,
        storagePath,
      });
    }
  } catch (error) {
    await Promise.allSettled(
      attachments.map((file) =>
        storage.bucket().file(file.storagePath).delete(),
      ),
    );
    throw error;
  }

  const email = {
    from: parsed.from?.text ?? sender,
    subject: (parsed.subject ?? "").slice(0, 300),
    text: emailBodyText(parsed.text, parsed.html),
  };
  const result = await extract(
    db,
    organizationId,
    kept.map((file) => ({
      name: file.name,
      contentType: file.contentType,
      bytes: file.content,
    })),
    email,
  );
  await ref.create({
    organizationId,
    messageId,
    from: email.from.slice(0, 300),
    fromAddress: emailAddress(sender),
    subject: email.subject,
    bodyText: email.text,
    receivedAt: Timestamp.fromDate(parsed.date ?? new Date()),
    attachments,
    ...result,
    createdEntity: null,
    createdAt: FieldValue.serverTimestamp(),
    processedAt: null,
    processedBy: null,
  });
  return result.status === "ready" ? "stored" : "failed";
}

/**
 * Reads new messages from the finance mailbox. Mail from trusted senders is
 * stored with what the AI read from it; everything read is marked as seen
 * and remembered by UID, so it is never read twice.
 */
export async function readIncomingEmails(
  db: Firestore,
  storage: Storage,
  organizationId: string,
  trigger: "scheduled" | "manual",
  actorId: string | null,
): Promise<IncomingEmailRunSummary> {
  const availability = await incomingEmailAvailability(db, organizationId);
  if (!availability.mailbox || !availability.ai)
    throw new IncomingEmailError("incomingEmailDisabled", 409);
  if (!(await takeLease(db, organizationId)))
    throw new IncomingEmailError("incomingEmailBusy", 409);

  const ref = db.collection(SETTINGS).doc(organizationId);
  const data = (await ref.get()).data()!;
  const settings = settingsFrom(data);
  const summary: IncomingEmailRunSummary = {
    read: 0,
    stored: 0,
    skipped: 0,
    failed: 0,
  };
  let uidValidity: string | null = (data.uidValidity as string) ?? null;
  let lastUid: number | null =
    typeof data.lastUid === "number" ? data.lastUid : null;
  let runError: string | null = null;
  try {
    await withFolder(
      {
        ...settings,
        password: decryptPassword(String(data.encryptedPassword)),
      },
      async (connection) => {
        const mailbox = connection.mailbox;
        if (!mailbox) throw new IncomingEmailError("mailboxFolderMissing", 400);
        const validity = String(mailbox.uidValidity);
        if (validity !== uidValidity) {
          uidValidity = validity;
          lastUid = null;
        }
        const since = new Date(Date.now() - FIRST_READ_DAYS * 86_400_000);
        const found =
          (await connection.search(
            lastUid === null ? { since } : { uid: `${lastUid + 1}:*` },
            { uid: true },
          )) || [];
        const pending = found
          .filter((uid) => lastUid === null || uid > lastUid)
          .sort((a, b) => a - b)
          .slice(0, INCOMING_EMAIL_BATCH);
        if (lastUid === null && !pending.length)
          lastUid = Math.max(0, mailbox.uidNext - 1);
        for (const uid of pending) {
          summary.read += 1;
          const meta = await connection.fetchOne(
            String(uid),
            { uid: true, size: true },
            { uid: true },
          );
          let outcome: StoredOutcome = {
            skipped: meta ? "tooLarge" : "unreadable",
          };
          if (meta && (meta.size ?? 0) <= MAX_MESSAGE_BYTES) {
            outcome = { skipped: "unreadable" };
            const message = await connection.fetchOne(
              String(uid),
              { uid: true, source: true },
              { uid: true },
            );
            if (message && message.source)
              outcome = await storeMessage(
                db,
                storage,
                organizationId,
                settings.trustedSenders,
                message.source,
                `uid-${validity}-${uid}@incoming`,
              ).catch((error: unknown) => {
                console.error("Incoming email could not be stored", {
                  organizationId,
                  uid,
                  errorClass: error instanceof Error ? error.name : "unknown",
                });
                return "failed" as const;
              });
          }
          if (typeof outcome === "string") summary[outcome] += 1;
          else recordSkip(summary, outcome.skipped, outcome.sender);
          await connection.messageFlagsAdd(String(uid), ["\\Seen"], {
            uid: true,
          });
          lastUid = uid;
        }
      },
    );
  } catch (error) {
    runError =
      error instanceof IncomingEmailError
        ? error.code
        : "mailboxConnectionFailed";
    if (!(error instanceof IncomingEmailError))
      console.error("Incoming email read failed", { organizationId, error });
    throw error instanceof IncomingEmailError
      ? error
      : new IncomingEmailError("mailboxConnectionFailed", 502);
  } finally {
    const batch = db.batch();
    batch.update(ref, {
      uidValidity,
      lastUid,
      lastRunAt: FieldValue.serverTimestamp(),
      lastRunSummary: summary,
      lastRunError: runError,
      lockUntil: null,
    });
    batch.create(db.collection("auditLogs").doc(), {
      organizationId,
      actorUserId: actorId,
      action: "incomingEmails.read",
      entityType: "incomingEmailSettings",
      entityId: organizationId,
      timestamp: FieldValue.serverTimestamp(),
      metadata: { trigger, ...summary, error: runError },
    });
    await batch.commit();
  }
  return summary;
}

/** Organizations whose mailbox is switched on, for the scheduled read. */
export async function organizationsWithIncomingEmail(db: Firestore) {
  const snapshot = await db
    .collection(SETTINGS)
    .where("enabled", "==", true)
    .get();
  return snapshot.docs.map((document) => document.id);
}

export type IncomingEmailView = {
  id: string;
  from: string;
  subject: string;
  bodyText: string;
  receivedAt: string | null;
  attachments: Omit<IncomingEmailAttachment, "storagePath">[];
  status: IncomingEmailStatus;
  kind: IncomingEmailKind;
  extraction: FinanceExtraction | null;
  error: string | null;
  createdEntity: { type: "transaction" | "invoice"; id: string } | null;
};

function viewFrom(
  id: string,
  data: Record<string, unknown>,
): IncomingEmailView {
  const attachments = (data.attachments ?? []) as IncomingEmailAttachment[];
  return {
    id,
    from: String(data.from ?? ""),
    subject: String(data.subject ?? ""),
    bodyText: String(data.bodyText ?? ""),
    receivedAt: isoDate(data.receivedAt),
    attachments: attachments.map(({ id, name, size, contentType }) => ({
      id,
      name,
      size,
      contentType,
    })),
    status: isIncomingEmailStatus(data.status) ? data.status : "failed",
    kind: (data.kind as IncomingEmailKind | undefined) ?? "unknown",
    extraction: (data.extraction as FinanceExtraction | null) ?? null,
    error: (data.error as string | null) ?? null,
    createdEntity:
      (data.createdEntity as IncomingEmailView["createdEntity"]) ?? null,
  };
}

export async function listIncomingEmails(
  db: Firestore,
  organizationId: string,
  status: IncomingEmailStatus[],
  received?: { from: Date; to: Date },
) {
  let query = db
    .collection(EMAILS)
    .where("organizationId", "==", organizationId)
    .where("status", "in", status);
  if (received)
    query = query
      .where("receivedAt", ">=", received.from)
      .where("receivedAt", "<", received.to);
  const snapshot = await query.orderBy("receivedAt", "desc").limit(200).get();
  return snapshot.docs.map((document) =>
    viewFrom(document.id, document.data()),
  );
}

async function ownEmail(db: Firestore, organizationId: string, id: string) {
  const snapshot = await db.collection(EMAILS).doc(id).get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.organizationId !== organizationId)
    throw new IncomingEmailError("notFound", 404);
  return { ref: snapshot.ref, data: data! };
}

function requireProcess(actor: PortalUser) {
  if (!can(actor, "finance.incomingEmails.process"))
    throw new IncomingEmailError("forbidden", 403);
}

export async function updateIncomingEmail(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  id: string,
  action: IncomingEmailAction,
) {
  requireProcess(actor);
  const { ref, data } = await ownEmail(db, actor.organizationId, id);
  const status = isIncomingEmailStatus(data.status) ? data.status : "failed";
  if (!canApplyIncomingEmailAction(status, action))
    throw new IncomingEmailError("incomingEmailInvalidState", 409);
  let update: Record<string, unknown>;
  if (action === "retry") {
    const attachments = (data.attachments ?? []) as IncomingEmailAttachment[];
    const files = await Promise.all(
      attachments.map(async (file) => ({
        name: file.name,
        contentType: file.contentType,
        bytes: (await storage.bucket().file(file.storagePath).download())[0],
      })),
    );
    update = await extract(db, actor.organizationId, files, {
      from: String(data.from ?? ""),
      subject: String(data.subject ?? ""),
      text: String(data.bodyText ?? ""),
    });
  } else
    update = {
      status:
        action === "dismiss"
          ? "dismissed"
          : data.extraction
            ? "ready"
            : "failed",
    };
  const batch = db.batch();
  batch.update(ref, {
    ...update,
    processedAt: FieldValue.serverTimestamp(),
    processedBy: actor.id,
  });
  batch.create(db.collection("auditLogs").doc(), {
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action: `incomingEmail.${action}`,
    entityType: "incomingFinanceEmail",
    entityId: id,
    timestamp: FieldValue.serverTimestamp(),
    metadata: { status: update.status },
  });
  await batch.commit();
  return viewFrom(id, { ...data, ...update });
}

/** The email a new transaction or invoice is being made from, if it still can be. */
export async function convertibleIncomingEmail(
  db: Firestore,
  actor: PortalUser,
  id: string,
) {
  requireProcess(actor);
  const { data } = await ownEmail(db, actor.organizationId, id);
  if (
    !isIncomingEmailStatus(data.status) ||
    !canConvertIncomingEmail(data.status)
  )
    throw new IncomingEmailError("incomingEmailAlreadyConverted", 409);
  return viewFrom(id, data);
}

/** Marks the email as turned into the record just created. */
export async function linkIncomingEmail(
  db: Firestore,
  actor: PortalUser,
  id: string,
  entity: { type: "transaction" | "invoice"; id: string },
) {
  const ref = db.collection(EMAILS).doc(id);
  await db.runTransaction(async (transaction) => {
    const data = (await transaction.get(ref)).data();
    if (
      data?.organizationId !== actor.organizationId ||
      !isIncomingEmailStatus(data.status) ||
      !canConvertIncomingEmail(data.status)
    )
      throw new IncomingEmailError("incomingEmailAlreadyConverted", 409);
    transaction.update(ref, {
      status: "converted",
      createdEntity: entity,
      processedAt: FieldValue.serverTimestamp(),
      processedBy: actor.id,
    });
    transaction.create(db.collection("auditLogs").doc(), {
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      action: "incomingEmail.converted",
      entityType: "incomingFinanceEmail",
      entityId: id,
      timestamp: FieldValue.serverTimestamp(),
      metadata: { entityType: entity.type, entityId: entity.id },
    });
  });
}

export async function readIncomingEmailAttachment(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  id: string,
  attachmentId: string,
) {
  if (!can(actor, "finance.incomingEmails.view"))
    throw new IncomingEmailError("forbidden", 403);
  const { data } = await ownEmail(db, actor.organizationId, id);
  const file = ((data.attachments ?? []) as IncomingEmailAttachment[]).find(
    (attachment) => attachment.id === attachmentId,
  );
  if (!file) throw new IncomingEmailError("notFound", 404);
  const [bytes] = await storage.bucket().file(file.storagePath).download();
  return { name: file.name, contentType: file.contentType, bytes };
}
