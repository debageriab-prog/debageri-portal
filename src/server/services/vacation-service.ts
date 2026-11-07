import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  availableForTargets,
  carryOverAdjustments,
  computeVacationBalance,
  type VacationBalance,
  type VacationBucket,
} from "@/domain/vacation/balance";
import {
  periodAfter,
  periodContaining,
  periodId,
  type VacationPeriodBounds,
  type VacationSettings,
} from "@/domain/vacation/periods";
import { earnedMinutes } from "@/domain/vacation/renewal";
import type { PortalUser } from "@/domain/types";

export type VacationAdjustmentReason =
  "opening" | "manual" | "carryOver" | "advanceGrant";

export interface VacationPeriodRecord extends VacationPeriodBounds {
  id: string;
  grantedMinutes: number;
  daysPerYearAtGrant: number;
  source: "setup" | "renewal";
}

export interface VacationAdjustmentRecord {
  id: string;
  periodId: string;
  bucket: VacationBucket;
  deltaMinutes: number;
  reason: VacationAdjustmentReason;
  note: string | null;
  actorName: string | null;
  createdAt: number;
}

export interface VacationSummary {
  settings: VacationSettings;
  period: VacationPeriodRecord;
  balance: VacationBalance;
  /** Vacation in submitted weeks that are not approved yet. */
  pendingMinutes: number;
  adjustments: VacationAdjustmentRecord[];
  nextRenewal: { date: string; estimatedMinutes: number } | null;
}

export class VacationError extends Error {
  constructor(
    public readonly code: "invalidInput" | "notFound" | "notTracked",
    public readonly status: number,
  ) {
    super(code);
  }
}

/** Vacation is tracked for everyone except administrators. */
export function tracksVacation(role: string) {
  return role !== "admin";
}

export function vacationSettingsFrom(value: unknown): VacationSettings | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const number = (key: string) => Number(data[key]);
  if (![number("resetMonth"), number("resetDay")].every(Number.isInteger))
    return null;
  return {
    resetMonth: number("resetMonth"),
    resetDay: number("resetDay"),
    daysPerYear: Number(data.daysPerYear ?? 0),
    supplementBps: Number(data.supplementBps ?? 0),
  };
}

function toPeriod(
  doc: FirebaseFirestore.DocumentSnapshot,
): VacationPeriodRecord {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    start: String(data.periodStart),
    end: String(data.periodEnd),
    grantedMinutes: Number(data.grantedMinutes ?? 0),
    daysPerYearAtGrant: Number(data.daysPerYearAtGrant ?? 0),
    source: data.source === "renewal" ? "renewal" : "setup",
  };
}

function toAdjustment(
  doc: FirebaseFirestore.DocumentSnapshot,
): VacationAdjustmentRecord {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    periodId: String(data.periodId),
    bucket: data.bucket as VacationBucket,
    deltaMinutes: Number(data.deltaMinutes ?? 0),
    reason: data.reason as VacationAdjustmentReason,
    note: data.note ?? null,
    actorName: data.actorName ?? null,
    createdAt: data.createdAt?.toMillis?.() ?? 0,
  };
}

interface Writer {
  organizationId: string;
  userId: string;
  actorId: string | null;
  actorName: string | null;
}

function addPeriod(
  db: Firestore,
  batch: FirebaseFirestore.WriteBatch,
  writer: Writer,
  bounds: VacationPeriodBounds,
  grantedMinutes: number,
  daysPerYear: number,
  source: "setup" | "renewal",
) {
  const id = periodId(writer.organizationId, writer.userId, bounds.start);
  batch.create(db.collection("vacationPeriods").doc(id), {
    organizationId: writer.organizationId,
    userId: writer.userId,
    periodStart: bounds.start,
    periodEnd: bounds.end,
    grantedMinutes,
    daysPerYearAtGrant: daysPerYear,
    source,
    createdAt: FieldValue.serverTimestamp(),
  });
  return id;
}

function addAdjustments(
  db: Firestore,
  batch: FirebaseFirestore.WriteBatch,
  writer: Writer,
  period: string,
  deltas: Partial<Record<VacationBucket, number>>,
  reason: VacationAdjustmentReason,
  note: string | null,
) {
  for (const bucket of ["normal", "saved", "advance"] as const) {
    const deltaMinutes = deltas[bucket] ?? 0;
    if (!deltaMinutes) continue;
    batch.create(db.collection("vacationAdjustments").doc(), {
      organizationId: writer.organizationId,
      userId: writer.userId,
      periodId: period,
      bucket,
      deltaMinutes,
      reason:
        bucket === "advance" && reason === "opening" ? "advanceGrant" : reason,
      note,
      actorUid: writer.actorId,
      actorName: writer.actorName,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}

/**
 * Adds the first vacation period, with the opening balance, to the batch that
 * creates a new employee. New hires earn their days for the next period.
 */
export function addVacationSetup(
  db: Firestore,
  batch: FirebaseFirestore.WriteBatch,
  writer: Writer,
  settings: VacationSettings,
  today: string,
  opening: { normalMinutes: number; advanceMinutes: number },
) {
  const id = addPeriod(
    db,
    batch,
    writer,
    periodContaining(today, settings),
    0,
    settings.daysPerYear,
    "setup",
  );
  addAdjustments(
    db,
    batch,
    writer,
    id,
    { normal: opening.normalMinutes, advance: opening.advanceMinutes },
    "opening",
    null,
  );
}

/**
 * Vacation minutes from time reports inside the period: `approved` counts
 * toward the balance, `pending` is in weeks still waiting for approval.
 */
async function vacationUsage(
  db: Firestore,
  organizationId: string,
  userId: string,
  bounds: VacationPeriodBounds,
) {
  const entries = await db
    .collection("timeEntries")
    .where("organizationId", "==", organizationId)
    .where("userId", "==", userId)
    .where("date", ">=", bounds.start)
    .where("date", "<=", bounds.end)
    .get();
  const vacation = entries.docs
    .map((doc) => doc.data())
    .filter((data) => data.timeCodeSnapshot?.category === "vacation");
  const sheetIds = [
    ...new Set(vacation.map((data) => String(data.timesheetId))),
  ];
  if (!sheetIds.length) return { approved: 0, pending: 0 };
  const sheets = await db.getAll(
    ...sheetIds.map((id) => db.collection("timesheets").doc(id)),
  );
  const status = new Map(
    sheets
      .filter((sheet) => sheet.data()?.organizationId === organizationId)
      .map((sheet) => [sheet.id, String(sheet.data()?.status)]),
  );
  const sum = (wanted: string) =>
    vacation
      .filter((data) => status.get(String(data.timesheetId)) === wanted)
      .reduce((total, data) => total + Number(data.minutes ?? 0), 0);
  return { approved: sum("approved"), pending: sum("submitted") };
}

async function loadAdjustments(
  db: Firestore,
  organizationId: string,
  userId: string,
) {
  const snapshot = await db
    .collection("vacationAdjustments")
    .where("organizationId", "==", organizationId)
    .where("userId", "==", userId)
    .get();
  return snapshot.docs.map(toAdjustment);
}

async function latestPeriod(
  db: Firestore,
  organizationId: string,
  userId: string,
) {
  const snapshot = await db
    .collection("vacationPeriods")
    .where("organizationId", "==", organizationId)
    .where("userId", "==", userId)
    .orderBy("periodStart", "desc")
    .limit(1)
    .get();
  return snapshot.empty ? null : toPeriod(snapshot.docs[0]!);
}

function sumFor(
  adjustments: VacationAdjustmentRecord[],
  bucket: VacationBucket,
  period?: string,
) {
  return adjustments
    .filter(
      (item) =>
        item.bucket === bucket &&
        (period === undefined || item.periodId === period),
    )
    .reduce((sum, item) => sum + item.deltaMinutes, 0);
}

async function balanceFor(
  db: Firestore,
  organizationId: string,
  userId: string,
  period: VacationPeriodRecord,
  adjustments: VacationAdjustmentRecord[],
) {
  // Advance days are one running bucket; earlier periods' usage is already
  // posted as carry-over rows, so only this period's usage applies.
  const usage = await vacationUsage(db, organizationId, userId, period);
  const balance = computeVacationBalance({
    grantedMinutes: period.grantedMinutes,
    normalAdjustMinutes: sumFor(adjustments, "normal", period.id),
    savedAdjustMinutes: sumFor(adjustments, "saved", period.id),
    advanceAdjustMinutes: sumFor(adjustments, "advance"),
    usedMinutes: usage.approved,
  });
  return Object.assign(balance, { pendingMinutes: usage.pending });
}

function isAlreadyExists(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === 6 || error.code === "already-exists")
  );
}

/**
 * Creates the setup period when none exists and every renewal that is due by
 * `today`, carrying leftover days into saved days. Period IDs are fixed by
 * their start date, so a second run (cron and a page view at once) fails to
 * create the same period and changes nothing.
 */
export async function ensureVacationPeriods(
  db: Firestore,
  organizationId: string,
  userId: string,
  today: string,
): Promise<VacationPeriodRecord | null> {
  const user = await db.collection("users").doc(userId).get();
  const data = user.data();
  if (!data || data.organizationId !== organizationId) return null;
  const settings = vacationSettingsFrom(data.vacation);
  if (!settings || !tracksVacation(String(data.role))) return null;
  const writer: Writer = {
    organizationId,
    userId,
    actorId: null,
    actorName: null,
  };
  let current = await latestPeriod(db, organizationId, userId);
  if (!current) {
    const batch = db.batch();
    addPeriod(
      db,
      batch,
      writer,
      periodContaining(today, settings),
      0,
      settings.daysPerYear,
      "setup",
    );
    await batch.commit().catch((error) => {
      if (!isAlreadyExists(error)) throw error;
    });
    return latestPeriod(db, organizationId, userId);
  }
  const employmentEnd = data.employmentEndDate ?? null;
  while (current.end < today) {
    const next = periodAfter(current, settings);
    if (employmentEnd && next.start > employmentEnd) break;
    const adjustments = await loadAdjustments(db, organizationId, userId);
    const closing = await balanceFor(
      db,
      organizationId,
      userId,
      current,
      adjustments,
    );
    const granted = earnedMinutes(
      settings.daysPerYear,
      current,
      data.employmentStartDate ?? null,
      employmentEnd,
    );
    const batch = db.batch();
    const id = addPeriod(
      db,
      batch,
      writer,
      next,
      granted,
      settings.daysPerYear,
      "renewal",
    );
    addAdjustments(
      db,
      batch,
      writer,
      id,
      carryOverAdjustments(closing),
      "carryOver",
      null,
    );
    batch.create(db.collection("auditLogs").doc(), {
      organizationId,
      actorUserId: null,
      action: "vacation.renewed",
      entityType: "vacationPeriod",
      entityId: id,
      timestamp: FieldValue.serverTimestamp(),
      metadata: { userId, grantedMinutes: granted, periodStart: next.start },
    });
    try {
      await batch.commit();
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
    }
    current = (await latestPeriod(db, organizationId, userId)) ?? current;
  }
  return current;
}

async function loadTrackedUser(
  db: Firestore,
  organizationId: string,
  userId: string,
) {
  const user = await db.collection("users").doc(userId).get();
  if (!user.exists || user.data()?.organizationId !== organizationId)
    throw new VacationError("notFound", 404);
  const settings = vacationSettingsFrom(user.data()?.vacation);
  if (!settings || !tracksVacation(String(user.data()?.role)))
    throw new VacationError("notTracked", 409);
  return { user, settings };
}

export async function getVacationSummary(
  db: Firestore,
  organizationId: string,
  userId: string,
  today: string,
): Promise<VacationSummary> {
  const { user, settings } = await loadTrackedUser(db, organizationId, userId);
  const period = await ensureVacationPeriods(db, organizationId, userId, today);
  if (!period) throw new VacationError("notTracked", 409);
  const adjustments = await loadAdjustments(db, organizationId, userId);
  const { pendingMinutes, ...balance } = await balanceFor(
    db,
    organizationId,
    userId,
    period,
    adjustments,
  );
  const employmentEnd = user.data()?.employmentEndDate ?? null;
  const next = periodAfter(period, settings);
  return {
    settings,
    period,
    balance,
    pendingMinutes,
    adjustments: adjustments
      .filter(
        (item) => item.periodId === period.id || item.bucket === "advance",
      )
      .sort((a, b) => b.createdAt - a.createdAt),
    nextRenewal:
      employmentEnd && next.start > employmentEnd
        ? null
        : {
            date: next.start,
            estimatedMinutes: earnedMinutes(
              settings.daysPerYear,
              period,
              user.data()?.employmentStartDate ?? null,
              employmentEnd,
            ),
          },
  };
}

/**
 * The balance for the person themselves or for someone reviewing their time
 * report. Ledger rows are left out, because their notes are internal.
 * Returns null when vacation is not tracked for the person.
 */
export async function getVacationOverview(
  db: Firestore,
  organizationId: string,
  userId: string,
  today: string,
): Promise<Omit<VacationSummary, "adjustments"> | null> {
  try {
    const { adjustments: _internal, ...overview } = await getVacationSummary(
      db,
      organizationId,
      userId,
      today,
    );
    void _internal;
    return overview;
  } catch (error) {
    if (error instanceof VacationError) return null;
    throw error;
  }
}

/** Sets what is left today in each bucket, posting the differences as rows. */
export async function adjustVacationBalance(
  db: Firestore,
  actor: PortalUser,
  userId: string,
  targets: { normal: number; saved: number; advance: number },
  note: string,
  today: string,
) {
  await loadTrackedUser(db, actor.organizationId, userId);
  const period = await ensureVacationPeriods(
    db,
    actor.organizationId,
    userId,
    today,
  );
  if (!period) throw new VacationError("notTracked", 409);
  const adjustments = await loadAdjustments(db, actor.organizationId, userId);
  const balance = await balanceFor(
    db,
    actor.organizationId,
    userId,
    period,
    adjustments,
  );
  const available = availableForTargets(targets, balance.used);
  const deltas = {
    normal:
      available.normal -
      (period.grantedMinutes + sumFor(adjustments, "normal", period.id)),
    saved: available.saved - sumFor(adjustments, "saved", period.id),
    advance: available.advance - sumFor(adjustments, "advance"),
  };
  const writer: Writer = {
    organizationId: actor.organizationId,
    userId,
    actorId: actor.id,
    actorName: actor.displayName,
  };
  const batch = db.batch();
  addAdjustments(db, batch, writer, period.id, deltas, "manual", note);
  batch.create(db.collection("auditLogs").doc(), {
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action: "vacation.balanceAdjusted",
    entityType: "user",
    entityId: userId,
    timestamp: FieldValue.serverTimestamp(),
    metadata: { periodId: period.id, ...deltas, note },
  });
  await batch.commit();
}

/** Every organization's tracked employees, for the daily renewal job. */
export async function renewAllVacations(db: Firestore, today: string) {
  const users = await db
    .collection("users")
    .where("vacation.resetMonth", ">=", 1)
    .get();
  const organizations: Record<string, { renewed: number; failed: number }> = {};
  let failed = 0;
  for (const user of users.docs) {
    const data = user.data();
    const organizationId = String(data.organizationId);
    const result = (organizations[organizationId] ??= {
      renewed: 0,
      failed: 0,
    });
    if (!tracksVacation(String(data.role))) continue;
    try {
      const before = await latestPeriod(db, organizationId, user.id);
      const after = await ensureVacationPeriods(
        db,
        organizationId,
        user.id,
        today,
      );
      if (after && after.id !== before?.id) result.renewed += 1;
    } catch {
      result.failed += 1;
      failed += 1;
    }
  }
  return { organizations, failed };
}
