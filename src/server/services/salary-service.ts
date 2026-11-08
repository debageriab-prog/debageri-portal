import "server-only";

import {
  FieldValue,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
  type WriteBatch,
} from "firebase-admin/firestore";
import { can } from "@/domain/access/permissions";
import {
  isCompensationModel,
  monthlySalaryMinor,
  receivesSalary,
} from "@/domain/finance/compensation";
import type { SalaryLine } from "@/domain/salary/articles";
import { buildSalaryLines, type SalaryTimeEntry } from "@/domain/salary/build";
import {
  payrollProfileFrom,
  payrollProfileId,
  type PayrollProfile,
} from "@/domain/salary/payroll-profile";
import {
  canMoveSlip,
  salaryRunId,
  salarySlipId,
  type SalarySlip,
  type SalarySlipProblem,
  type SalarySlipStatus,
  type SalaryYearToDate,
} from "@/domain/salary/slip";
import { employerFeeMinor, salaryTotals } from "@/domain/salary/totals";
import type { TaxTable } from "@/domain/salary/tax";
import { monthBounds } from "@/domain/time/working-days";
import type {
  CompensationModel,
  PortalUser,
  TimeCategory,
} from "@/domain/types";
import {
  DEFAULT_VACATION_SETTINGS,
  VACATION_DAY_MINUTES,
} from "@/domain/vacation/periods";
import {
  FinanceError,
  voidFinancialTransaction,
} from "@/server/services/finance-service";
import { loadTaxTable } from "@/server/services/tax-table-service";
import {
  getVacationSummary,
  vacationSettingsFrom,
} from "@/server/services/vacation-service";
import type { SalaryLineInput } from "@/server/validators/salary";
import type { Storage } from "firebase-admin/storage";
import { invoiceSettingsFrom } from "@/domain/finance/invoice-settings";
import {
  notificationLocale,
  type NotificationLocale,
} from "@/domain/notifications";
import { translate, type MessageKey } from "@/lib/localization/messages";
import {
  salarySlipFileName,
  salarySlipPdf,
  type SalarySlipPdfLabels,
} from "@/server/export/salary-slip-pdf";
import {
  PayslipError,
  storeGeneratedPayslip,
} from "@/server/services/payslip-service";

export function requireSalaryPermission(
  actor: PortalUser,
  key: "finance.salary.view" | "finance.salary.edit" | "finance.salary.book",
) {
  if (!can(actor, key)) throw new FinanceError("forbidden", 403);
}

function audit(
  db: Firestore,
  batch: WriteBatch,
  actor: PortalUser,
  action: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  batch.create(db.collection("auditLogs").doc(), {
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action,
    entityType: "salarySlip",
    entityId,
    timestamp: FieldValue.serverTimestamp(),
    metadata,
  });
}

/** The agreement in force during the paid month, or null. */
async function agreementForMonth(
  db: Firestore,
  organizationId: string,
  userId: string,
  period: string,
) {
  const { from, to } = monthBounds(period);
  const snapshot = await db
    .collection("compensationAgreements")
    .where("organizationId", "==", organizationId)
    .where("userId", "==", userId)
    .where("validFrom", "<=", to)
    .orderBy("validFrom", "desc")
    .limit(1)
    .get();
  const document = snapshot.docs[0];
  const data = document?.data();
  if (!document || !data || !isCompensationModel(data.model)) return null;
  if (data.validTo && data.validTo < from) return null;
  return {
    id: document.id,
    model: data.model as CompensationModel,
    fixedMonthlySalaryMinor: data.fixedMonthlySalaryMinor ?? null,
    requestedMonthlySalaryMinor: data.requestedMonthlySalaryMinor ?? null,
  };
}

/** Time from approved reports in the period; other weeks do not count yet. */
async function approvedEntries(
  db: Firestore,
  organizationId: string,
  userId: string,
  from: string,
  to: string,
): Promise<SalaryTimeEntry[]> {
  const entries = await db
    .collection("timeEntries")
    .where("organizationId", "==", organizationId)
    .where("userId", "==", userId)
    .where("date", ">=", from)
    .where("date", "<=", to)
    .get();
  const data = entries.docs.map((document) => document.data());
  const sheetIds = [...new Set(data.map((item) => String(item.timesheetId)))];
  if (!sheetIds.length) return [];
  const sheets = await db.getAll(
    ...sheetIds.map((id) => db.collection("timesheets").doc(id)),
  );
  const approved = new Set(
    sheets
      .filter(
        (sheet) =>
          sheet.data()?.organizationId === organizationId &&
          sheet.data()?.status === "approved",
      )
      .map((sheet) => sheet.id),
  );
  return data
    .filter((item) => approved.has(String(item.timesheetId)))
    .map((item) => ({
      date: String(item.date),
      minutes: Number(item.minutes ?? 0),
      category: String(
        item.timeCodeSnapshot?.category ?? "other",
      ) as TimeCategory,
    }));
}

async function holidaysBetween(
  db: Firestore,
  organizationId: string,
  from: string,
  to: string,
) {
  const snapshot = await db
    .collection("holidays")
    .where("organizationId", "==", organizationId)
    .get();
  return new Set(
    snapshot.docs
      .map((document) => String(document.data().date))
      .filter((date) => date >= from && date <= to),
  );
}

/** Earlier booked salaries of the same calendar year. */
async function yearToDate(
  db: Firestore,
  organizationId: string,
  userId: string,
  period: string,
): Promise<SalaryYearToDate> {
  const snapshot = await db
    .collection("salarySlips")
    .where("organizationId", "==", organizationId)
    .where("userId", "==", userId)
    .where("period", ">=", `${period.slice(0, 4)}-01`)
    .where("period", "<", period)
    .get();
  const totals = { grossMinor: 0, benefitsMinor: 0, taxMinor: 0 };
  for (const document of snapshot.docs) {
    const data = document.data();
    if (data.status !== "booked") continue;
    totals.grossMinor += Number(data.totals?.grossMinor ?? 0);
    totals.benefitsMinor += Number(data.totals?.benefitsMinor ?? 0);
    totals.taxMinor += Number(data.totals?.taxMinor ?? 0);
  }
  return totals;
}

async function vacationDays(
  db: Firestore,
  organizationId: string,
  userId: string,
  date: string,
) {
  try {
    const summary = await getVacationSummary(db, organizationId, userId, date);
    return {
      paidDays: summary.balance.normal / VACATION_DAY_MINUTES,
      savedDays: summary.balance.saved / VACATION_DAY_MINUTES,
    };
  } catch {
    // Vacation is not tracked for everyone, such as administrators.
    return null;
  }
}

function problemFor(
  profile: PayrollProfile,
  table: TaxTable | null,
  overrideMinor: number | null,
): SalarySlipProblem {
  if (!profile.personalNumber || !profile.addressLine)
    return "payrollProfileMissing";
  if (overrideMinor !== null || profile.taxAdjustment.type !== "none")
    return null;
  if (profile.taxTable === null) return "payrollProfileMissing";
  return table ? null : "taxTableMissing";
}

type TaxTableCache = Map<string, Promise<TaxTable | null>>;

/** Totals and problem for a slip's lines, from its stored tax details. */
async function workOut(
  db: Firestore,
  organizationId: string,
  slip: Pick<SalarySlip, "lines" | "tax"> & { profile: PayrollProfile },
  tables: TaxTableCache,
) {
  const key = `${slip.tax.year}_${slip.tax.table}`;
  if (slip.tax.table !== null && !tables.has(key))
    tables.set(
      key,
      loadTaxTable(db, organizationId, slip.tax.year, slip.tax.table),
    );
  const table =
    slip.tax.table === null ? null : ((await tables.get(key)) ?? null);
  const problem = problemFor(slip.profile, table, slip.tax.overrideMinor);
  const totals = salaryTotals(slip.lines, {
    table,
    column: slip.tax.column,
    adjustment: slip.tax.adjustment,
    // Without a table the tax stays at zero until it can be worked out.
    overrideMinor:
      slip.tax.overrideMinor ??
      (slip.tax.adjustment.type === "none" && !table ? 0 : null),
  });
  return { problem, totals };
}

function personFrom(user: DocumentData, profile: PayrollProfile) {
  return {
    displayName: String(user.displayName ?? ""),
    employeeNumber: String(user.employeeNumber ?? ""),
    personalNumber: profile.personalNumber,
    addressLine: profile.addressLine,
    postalCode: profile.postalCode,
    city: profile.city,
    bankClearing: profile.bankClearing,
    bankAccount: profile.bankAccount,
  };
}

export interface SalaryCandidate {
  userId: string;
  name: string;
  model: CompensationModel;
  monthlyMinor: number;
  /** Payroll details are missing, so tax cannot be worked out yet. */
  payrollMissing: boolean;
}

type Eligible = {
  user: QueryDocumentSnapshot;
  agreement: NonNullable<Awaited<ReturnType<typeof agreementForMonth>>>;
};

/** Everyone the company pays in the month: active, employed and agreed. */
async function eligiblePeople(
  db: Firestore,
  organizationId: string,
  period: string,
): Promise<Eligible[]> {
  const { from, to } = monthBounds(period);
  const users = await db
    .collection("users")
    .where("organizationId", "==", organizationId)
    .get();
  const people: Eligible[] = [];
  for (const user of users.docs) {
    const data = user.data();
    if (data.status !== "active") continue;
    if (
      !receivesSalary({ role: String(data.role), paysSalary: data.paysSalary })
    )
      continue;
    if (data.employmentStartDate && data.employmentStartDate > to) continue;
    if (data.employmentEndDate && data.employmentEndDate < from) continue;
    const agreement = await agreementForMonth(
      db,
      organizationId,
      user.id,
      period,
    );
    if (!agreement || monthlySalaryMinor(agreement) <= 0) continue;
    people.push({ user, agreement });
  }
  return people.sort((left, right) =>
    String(left.user.data().displayName).localeCompare(
      String(right.user.data().displayName),
      "sv",
    ),
  );
}

/** Who can get a salary row for the month, for choosing whom to pay. */
export async function salaryCandidates(
  db: Firestore,
  organizationId: string,
  period: string,
): Promise<SalaryCandidate[]> {
  const people = await eligiblePeople(db, organizationId, period);
  const profiles = people.length
    ? await db.getAll(
        ...people.map(({ user }) =>
          db
            .collection("payrollProfiles")
            .doc(payrollProfileId(organizationId, user.id)),
        ),
      )
    : [];
  return people.map(({ user, agreement }, index) => {
    const profile = payrollProfileFrom(profiles[index]?.data());
    return {
      userId: user.id,
      name: String(user.data().displayName ?? ""),
      model: agreement.model,
      monthlyMinor: monthlySalaryMinor(agreement),
      payrollMissing:
        !profile.personalNumber ||
        !profile.addressLine ||
        (profile.taxAdjustment.type === "none" && profile.taxTable === null),
    };
  });
}

interface SlipContext {
  period: string;
  paymentDate: string;
  eventFrom: string;
  eventTo: string;
  holidays: ReadonlySet<string>;
  tables: TaxTableCache;
}

/**
 * Builds or rebuilds one person's salary row in the batch. Lines added or
 * changed by hand are kept; with `useTimeReports` off, nothing comes from
 * time reports and the full monthly salary is paid.
 */
async function writeSlip(
  db: Firestore,
  batch: WriteBatch,
  actor: PortalUser,
  person: Eligible,
  context: SlipContext,
  stored: DocumentData | undefined,
  useTimeReports: boolean,
) {
  const { user, agreement } = person;
  const data = user.data();
  const id = salarySlipId(actor.organizationId, user.id, context.period);
  const [profileSnapshot, entries, ytd, vacation] = await Promise.all([
    db
      .collection("payrollProfiles")
      .doc(payrollProfileId(actor.organizationId, user.id))
      .get(),
    approvedEntries(
      db,
      actor.organizationId,
      user.id,
      context.eventFrom,
      context.eventTo,
    ),
    yearToDate(db, actor.organizationId, user.id, context.period),
    vacationDays(db, actor.organizationId, user.id, context.eventTo),
  ]);
  const profile = payrollProfileFrom(profileSnapshot.data());
  const settings = vacationSettingsFrom(data.vacation);
  const built = buildSalaryLines({
    period: context.period,
    agreement,
    // Without vacation settings the usual 0.8 % supplement applies.
    supplementBps:
      settings?.supplementBps ?? DEFAULT_VACATION_SETTINGS.supplementBps,
    eventFrom: context.eventFrom,
    eventTo: context.eventTo,
    entries: useTimeReports ? entries : [],
    holidays: context.holidays,
  });
  const kept: SalaryLine[] = (stored?.lines ?? []).filter(
    (line: SalaryLine) => line.manual,
  );
  const lines = [
    ...built.filter((line) => !kept.some((item) => item.id === line.id)),
    ...kept,
  ];
  const tax = {
    year: Number(context.paymentDate.slice(0, 4)),
    table: profile.taxTable,
    column: profile.taxColumn,
    adjustment: profile.taxAdjustment,
    overrideMinor: stored?.tax?.overrideMinor ?? null,
  };
  const { problem, totals } = await workOut(
    db,
    actor.organizationId,
    { lines, tax, profile },
    context.tables,
  );
  batch.set(db.collection("salarySlips").doc(id), {
    organizationId: actor.organizationId,
    userId: user.id,
    period: context.period,
    paymentDate: context.paymentDate,
    eventFrom: context.eventFrom,
    eventTo: context.eventTo,
    status: "initiated" satisfies SalarySlipStatus,
    problem,
    model: agreement.model,
    agreementId: agreement.id,
    fundedByConsultant: agreement.model === "flexible",
    person: personFrom(data, profile),
    tax,
    lines,
    totals,
    useTimeReports,
    /** Days with approved time in the event period, used or not. */
    reportedDays: new Set(entries.map((entry) => entry.date)).size,
    yearToDate: ytd,
    vacation,
    payslipId: stored?.payslipId ?? null,
    transactionIds: [],
    version: Number(stored?.version ?? -1) + 1,
    ...(stored
      ? {}
      : { createdAt: FieldValue.serverTimestamp(), createdBy: actor.id }),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.id,
  });
  return id;
}

/**
 * Creates the month's salary run with a row for each chosen person. Running
 * it again adds people newly chosen and rebuilds rows still being prepared,
 * keeping lines added by hand; rows of people no longer chosen are removed
 * while still being prepared. Rows that are ready or further along stay.
 */
export async function generateSalaryRun(
  db: Firestore,
  actor: PortalUser,
  input: {
    period: string;
    paymentDate: string;
    eventFrom: string;
    eventTo: string;
    userIds: string[];
  },
) {
  requireSalaryPermission(actor, "finance.salary.edit");
  const [people, holidays] = await Promise.all([
    eligiblePeople(db, actor.organizationId, input.period),
    holidaysBetween(db, actor.organizationId, input.eventFrom, input.eventTo),
  ]);
  const chosen = new Set(input.userIds);
  const context: SlipContext = { ...input, holidays, tables: new Map() };
  const batch = db.batch();
  const created: string[] = [];
  const rebuilt: string[] = [];
  const removed: string[] = [];

  for (const person of people) {
    const id = salarySlipId(actor.organizationId, person.user.id, input.period);
    const existing = await db.collection("salarySlips").doc(id).get();
    const stored = existing.data();
    if (existing.exists && stored?.status !== "initiated") continue;
    if (!chosen.has(person.user.id)) {
      if (existing.exists) {
        batch.delete(existing.ref);
        removed.push(id);
      }
      continue;
    }
    await writeSlip(
      db,
      batch,
      actor,
      person,
      context,
      stored,
      stored?.useTimeReports !== false,
    );
    (existing.exists ? rebuilt : created).push(id);
  }

  const runId = salaryRunId(actor.organizationId, input.period);
  batch.set(
    db.collection("salaryRuns").doc(runId),
    {
      organizationId: actor.organizationId,
      period: input.period,
      paymentDate: input.paymentDate,
      eventFrom: input.eventFrom,
      eventTo: input.eventTo,
      excludedUserIds: people
        .map((person) => person.user.id)
        .filter((userId) => !chosen.has(userId)),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.id,
    },
    { merge: true },
  );
  batch.create(db.collection("auditLogs").doc(), {
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    action: "salaryRun.generated",
    entityType: "salaryRun",
    entityId: runId,
    timestamp: FieldValue.serverTimestamp(),
    metadata: { period: input.period, created, rebuilt, removed },
  });
  await batch.commit();
  return { id: runId, created: created.length, rebuilt: rebuilt.length };
}

/** A row's stored run details, or a missing-row error. */
async function initiatedSlip(db: Firestore, actor: PortalUser, slipId: string) {
  const reference = db.collection("salarySlips").doc(slipId);
  const snapshot = await reference.get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.organizationId !== actor.organizationId)
    throw new FinanceError("salarySlipMissing", 404);
  if (data.status !== "initiated")
    throw new FinanceError("salarySlipLocked", 409);
  return { reference, data };
}

/**
 * Rebuilds one row with or without its time reports. Without them the full
 * monthly salary is paid, with no vacation supplement or leave deductions.
 */
export async function setSalarySlipTimeReports(
  db: Firestore,
  actor: PortalUser,
  input: { slipId: string; version: number; useTimeReports: boolean },
) {
  requireSalaryPermission(actor, "finance.salary.edit");
  const { data } = await initiatedSlip(db, actor, input.slipId);
  if (data.version !== input.version)
    throw new FinanceError("salarySlipChanged", 409);
  const person = (
    await eligiblePeople(db, actor.organizationId, String(data.period))
  ).find(({ user }) => user.id === data.userId);
  if (!person) throw new FinanceError("salarySlipMissing", 404);
  const batch = db.batch();
  await writeSlip(
    db,
    batch,
    actor,
    person,
    {
      period: String(data.period),
      paymentDate: String(data.paymentDate),
      eventFrom: String(data.eventFrom),
      eventTo: String(data.eventTo),
      holidays: await holidaysBetween(
        db,
        actor.organizationId,
        String(data.eventFrom),
        String(data.eventTo),
      ),
      tables: new Map(),
    },
    data,
    input.useTimeReports,
  );
  audit(db, batch, actor, "salarySlip.timeReports", input.slipId, {
    useTimeReports: input.useTimeReports,
  });
  await batch.commit();
}

/** Takes a person out of the month's salaries while their row is prepared. */
export async function removeSalarySlip(
  db: Firestore,
  actor: PortalUser,
  input: { slipId: string },
) {
  requireSalaryPermission(actor, "finance.salary.edit");
  const { reference, data } = await initiatedSlip(db, actor, input.slipId);
  const batch = db.batch();
  batch.delete(reference);
  batch.set(
    db
      .collection("salaryRuns")
      .doc(salaryRunId(actor.organizationId, String(data.period))),
    { excludedUserIds: FieldValue.arrayUnion(String(data.userId)) },
    { merge: true },
  );
  audit(db, batch, actor, "salarySlip.removed", input.slipId, {
    userId: data.userId,
  });
  await batch.commit();
}

function normalizeLines(lines: SalaryLineInput[]): SalaryLine[] {
  return lines.map((line) => ({
    ...line,
    article: line.article as SalaryLine["article"],
  }));
}

/** Saves edited lines and typed tax on a row that is still being prepared. */
export async function updateSalarySlip(
  db: Firestore,
  actor: PortalUser,
  input: {
    slipId: string;
    version: number;
    lines: SalaryLineInput[];
    taxOverrideMinor: number | null;
  },
) {
  requireSalaryPermission(actor, "finance.salary.edit");
  const reference = db.collection("salarySlips").doc(input.slipId);
  const snapshot = await reference.get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.organizationId !== actor.organizationId)
    throw new FinanceError("salarySlipMissing", 404);
  if (data.status !== "initiated")
    throw new FinanceError("salarySlipLocked", 409);
  if (data.version !== input.version)
    throw new FinanceError("salarySlipChanged", 409);
  const profile = payrollProfileFrom(
    (
      await db
        .collection("payrollProfiles")
        .doc(payrollProfileId(actor.organizationId, data.userId))
        .get()
    ).data(),
  );
  const lines = normalizeLines(input.lines);
  const tax = { ...data.tax, overrideMinor: input.taxOverrideMinor };
  const { problem, totals } = await workOut(
    db,
    actor.organizationId,
    { lines, tax, profile },
    new Map(),
  );
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(reference);
    if (current.data()?.version !== input.version)
      throw new FinanceError("salarySlipChanged", 409);
    transaction.update(reference, {
      lines,
      tax,
      totals,
      problem,
      version: input.version + 1,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.id,
    });
    transaction.create(db.collection("auditLogs").doc(), {
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      action: "salarySlip.updated",
      entityType: "salarySlip",
      entityId: input.slipId,
      timestamp: FieldValue.serverTimestamp(),
      metadata: {
        lines: lines.length,
        netMinor: totals.netMinor,
        taxOverridden: input.taxOverrideMinor !== null,
      },
    });
  });
  return input.slipId;
}

/** Marks rows ready, or reopens them for changes before they are booked. */
export async function setSalarySlipStatus(
  db: Firestore,
  actor: PortalUser,
  input: { slipIds: string[]; status: "ready" | "initiated" },
) {
  requireSalaryPermission(actor, "finance.salary.edit");
  const snapshots = await db.getAll(
    ...input.slipIds.map((id) => db.collection("salarySlips").doc(id)),
  );
  const batch = db.batch();
  for (const snapshot of snapshots) {
    const data = snapshot.data();
    if (!snapshot.exists || data?.organizationId !== actor.organizationId)
      throw new FinanceError("salarySlipMissing", 404);
    if (!canMoveSlip(data.status, input.status))
      throw new FinanceError("salarySlipLocked", 409);
    if (input.status === "ready" && data.problem)
      throw new FinanceError(data.problem, 409);
    batch.update(snapshot.ref, {
      status: input.status,
      version: Number(data.version ?? 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.id,
    });
    audit(
      db,
      batch,
      actor,
      input.status === "ready" ? "salarySlip.ready" : "salarySlip.reopened",
      snapshot.id,
      { from: data.status },
    );
  }
  await batch.commit();
}

const PDF_LABEL_KEYS = {
  title: "salarySlipPdf_title",
  yourSalary: "salarySlipPdf_yourSalary",
  paymentDate: "salarySlipPdf_paymentDate",
  salaryPeriod: "salarySlipPdf_salaryPeriod",
  taxTable: "salarySlipPdf_taxTable",
  personalNumber: "salarySlipPdf_personalNumber",
  employeeNumber: "salarySlipPdf_employeeNumber",
  events: "salarySlipPdf_events",
  name: "salarySlipPdf_name",
  from: "salarySlipPdf_from",
  to: "salarySlipPdf_to",
  scope: "salarySlipPdf_scope",
  quantity: "salarySlipPdf_quantity",
  price: "salarySlipPdf_price",
  amount: "salarySlipPdf_amount",
  tax: "salarySlipPdf_tax",
  taxTableLine: "salarySlipPdf_taxTableLine",
  taxAdjusted: "salarySlipPdf_taxAdjusted",
  rounding: "salarySlipPdf_rounding",
  reported: "salarySlipPdf_reported",
  grossMonth: "salarySlipPdf_grossMonth",
  benefitsMonth: "salarySlipPdf_benefitsMonth",
  taxMonth: "salarySlipPdf_taxMonth",
  grossYear: "salarySlipPdf_grossYear",
  benefitsYear: "salarySlipPdf_benefitsYear",
  taxYear: "salarySlipPdf_taxYear",
  balance: "salarySlipPdf_balance",
  paidVacation: "salarySlipPdf_paidVacation",
  savedVacation: "salarySlipPdf_savedVacation",
  salaryAccount: "salarySlipPdf_salaryAccount",
} as const satisfies Record<keyof SalarySlipPdfLabels, MessageKey>;

function pdfLabels(locale: NotificationLocale): SalarySlipPdfLabels {
  const labels = Object.fromEntries(
    Object.entries(PDF_LABEL_KEYS).map(([name, key]) => [
      name,
      translate(locale, key),
    ]),
  ) as SalarySlipPdfLabels;
  return labels;
}

/** The slip as stored, with the shape the payslip needs. */
function slipFrom(id: string, data: DocumentData): SalarySlip {
  return { id, ...data } as SalarySlip;
}

/**
 * Makes the payslip PDF of each ready row and publishes it as the person's
 * payslip for the month. A row whose payslip exists can be regenerated after
 * it was reopened and made ready again.
 */
export async function generatePayslips(
  db: Firestore,
  storage: Storage,
  actor: PortalUser,
  input: { slipIds: string[]; replaceExisting: boolean },
) {
  requireSalaryPermission(actor, "finance.salary.edit");
  const organization = (
    await db.collection("organizations").doc(actor.organizationId).get()
  ).data();
  const employer = invoiceSettingsFrom(
    organization?.invoicing,
    String(organization?.name ?? ""),
  );
  const snapshots = await db.getAll(
    ...input.slipIds.map((id) => db.collection("salarySlips").doc(id)),
  );
  for (const snapshot of snapshots) {
    const data = snapshot.data();
    if (!snapshot.exists || data?.organizationId !== actor.organizationId)
      throw new FinanceError("salarySlipMissing", 404);
    if (data.status !== "ready" && data.status !== "payslipGenerated")
      throw new FinanceError("salarySlipNotReady", 409);
  }
  const payslipIds: string[] = [];
  for (const snapshot of snapshots) {
    const slip = slipFrom(snapshot.id, snapshot.data()!);
    const user = (await db.collection("users").doc(slip.userId).get()).data();
    const locale = notificationLocale(user?.locale);
    const labels = pdfLabels(locale);
    const pdf = salarySlipPdf({
      slip,
      employer: { name: employer.legalName, orgNumber: employer.orgNumber },
      labels,
      lineNames: Object.fromEntries(
        slip.lines.map((line) => {
          const name =
            line.label ||
            translate(
              locale,
              (line.item
                ? `salaryItem_${line.item}`
                : `salaryArticle_${line.article}`) as MessageKey,
            );
          return [
            line.id,
            line.description ? `${name} - ${line.description}` : name,
          ];
        }),
      ),
    });
    let stored: { id: string };
    try {
      stored = await storeGeneratedPayslip(db, storage, actor, {
        userId: slip.userId,
        userName: slip.person.displayName,
        period: slip.period,
        salarySlipId: slip.id,
        fileName: salarySlipFileName(
          labels.title,
          slip.period,
          slip.person.displayName,
        ),
        pdf,
        replaceExisting: input.replaceExisting,
      });
    } catch (error) {
      if (error instanceof PayslipError && error.code === "payslipExists")
        throw new FinanceError("payslipExists", 409);
      throw error;
    }
    const batch = db.batch();
    batch.update(snapshot.ref, {
      status: "payslipGenerated" satisfies SalarySlipStatus,
      payslipId: stored.id,
      version: Number(slip.version ?? 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.id,
    });
    audit(db, batch, actor, "salarySlip.payslipGenerated", slip.id, {
      payslipId: stored.id,
    });
    await batch.commit();
    payslipIds.push(stored.id);
  }
  return payslipIds;
}

const SALARY_CATEGORIES = [
  ["salary", "Salary", "Lön"],
  ["salary_tax", "Salary tax", "Löneskatt"],
  ["employer_tax", "Employer contributions", "Arbetsgivaravgifter"],
] as const;

/**
 * The expense categories salaries are booked on, by code. Finance creates
 * them when it is turned on; any that are missing are created here, with
 * the same names. A deactivated one stops booking, since someone chose that.
 */
async function salaryCategories(
  db: Firestore,
  actor: PortalUser,
): Promise<Map<string, string>> {
  const snapshot = await db
    .collection("financeCategories")
    .where("organizationId", "==", actor.organizationId)
    .get();
  const byCode = new Map<string, string>();
  for (const document of snapshot.docs) {
    const data = document.data();
    const code = String(data.code);
    if (data.direction !== "expense") continue;
    if (!SALARY_CATEGORIES.some(([salaryCode]) => salaryCode === code))
      continue;
    if (data.active === false)
      throw new FinanceError("salaryCategoryMissing", 409);
    byCode.set(code, document.id);
  }
  const missing = SALARY_CATEGORIES.filter(([code]) => !byCode.has(code));
  if (!missing.length) return byCode;
  const batch = db.batch();
  for (const [code, en, sv] of missing) {
    const reference = db.collection("financeCategories").doc();
    batch.create(reference, {
      organizationId: actor.organizationId,
      code,
      name: { en, sv },
      direction: "expense",
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.id,
    });
    byCode.set(code, reference.id);
  }
  await batch.commit();
  return byCode;
}

type BookingPart = { code: string; amount: number; label: MessageKey };

/**
 * Books salaries as expenses in income and expenses: the payout (`salary`),
 * with `netPlusTax` also the withheld tax (`salary_tax`), and when asked the
 * employer contributions (`employer_tax`). Flexible consultants pay their
 * own salary from their balance; everyone else is a company expense. Each
 * expense carries the payslip: the same file as in the person's Pay slips.
 */
export async function bookSalarySlips(
  db: Firestore,
  actor: PortalUser,
  input: {
    slipIds: string[];
    mode: "net" | "netPlusTax";
    employerFee: boolean;
    employerFeeBps: number;
  },
) {
  requireSalaryPermission(actor, "finance.salary.book");
  const categories = await salaryCategories(db, actor);
  const snapshots = await db.getAll(
    ...input.slipIds.map((id) => db.collection("salarySlips").doc(id)),
  );
  for (const snapshot of snapshots) {
    const data = snapshot.data();
    if (!snapshot.exists || data?.organizationId !== actor.organizationId)
      throw new FinanceError("salarySlipMissing", 404);
    if (data.status !== "payslipGenerated" || !data.payslipId)
      throw new FinanceError("salarySlipNotBookable", 409);
  }
  const booked: string[] = [];
  for (const snapshot of snapshots) {
    const slip = slipFrom(snapshot.id, snapshot.data()!);
    const [user, payslip] = await Promise.all([
      db.collection("users").doc(slip.userId).get(),
      db.collection("payslips").doc(String(slip.payslipId)).get(),
    ]);
    const payslipData = payslip.data();
    if (!payslipData?.storagePath)
      throw new FinanceError("salarySlipNotBookable", 409);
    const role = String(user.data()?.role ?? "");
    const isConsultant = role === "consultant" || role === "employee";
    const feeMinor = input.employerFee
      ? employerFeeMinor(slip.totals.taxableMinor, input.employerFeeBps)
      : 0;
    const parts: BookingPart[] = [
      {
        code: "salary",
        amount: slip.totals.netMinor,
        label: "salarySlipBooking_net",
      },
    ];
    if (input.mode === "netPlusTax")
      parts.push({
        code: "salary_tax",
        amount: slip.totals.taxMinor,
        label: "salarySlipBooking_tax",
      });
    if (feeMinor > 0)
      parts.push({
        code: "employer_tax",
        amount: feeMinor,
        label: "salarySlipBooking_employerFee",
      });
    const locale = notificationLocale(user.data()?.locale);
    const batch = db.batch();
    const transactionIds: string[] = [];
    for (const part of parts) {
      if (part.amount <= 0) continue;
      const reference = db.collection("financialTransactions").doc();
      transactionIds.push(reference.id);
      // The same rule as other expenses: a flexible consultant's own money
      // lowers their balance, a fixed salary leaves it alone, and an expense
      // with nobody attached counts against the company.
      const balanceDelta = isConsultant
        ? slip.fundedByConsultant
          ? -part.amount
          : 0
        : -part.amount;
      batch.create(reference, {
        organizationId: actor.organizationId,
        direction: "expense",
        categoryId: categories.get(part.code),
        consultantId: isConsultant ? slip.userId : null,
        employeeId: slip.userId,
        date: slip.paymentDate,
        netMinor: part.amount,
        vatRateBps: 0,
        vatMinor: 0,
        roundingMinor: 0,
        grossMinor: part.amount,
        funding: slip.fundedByConsultant ? "consultant" : "company",
        applyConsultantShare: false,
        shareBpsOverride: null,
        visibleDescription: `${translate(locale, part.label)} ${slip.period} ${slip.person.displayName}`,
        internalNote: "",
        importKey: null,
        currency: "SEK",
        invoiceId: null,
        salarySlipId: slip.id,
        consultantBalanceDeltaMinor: balanceDelta,
        status: "posted",
        reversesTransactionId: null,
        reversedByTransactionId: null,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: actor.id,
      });
      batch.create(db.collection("financeAttachments").doc(), {
        organizationId: actor.organizationId,
        entityType: "transaction",
        entityId: reference.id,
        name: String(payslipData.fileName),
        size: Number(payslipData.size ?? 0),
        contentType: "application/pdf",
        storagePath: String(payslipData.storagePath),
        generated: true,
        payslipId: payslip.id,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: actor.id,
      });
    }
    batch.update(snapshot.ref, {
      status: "booked" satisfies SalarySlipStatus,
      transactionIds,
      booking: {
        mode: input.mode,
        employerFeeBps: input.employerFee ? input.employerFeeBps : 0,
        employerFeeMinor: feeMinor,
        bookedAt: FieldValue.serverTimestamp(),
        bookedBy: actor.id,
      },
      version: Number(slip.version ?? 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.id,
    });
    audit(db, batch, actor, "salarySlip.booked", slip.id, {
      mode: input.mode,
      employerFeeBps: input.employerFee ? input.employerFeeBps : 0,
      transactionIds,
    });
    await batch.commit();
    booked.push(slip.id);
  }
  return booked;
}

/**
 * Reverses a booked salary with linked reversals, so the ledger keeps its
 * history, and reopens the row so it can be corrected and booked again.
 */
export async function reverseSalarySlip(
  db: Firestore,
  actor: PortalUser,
  input: { slipId: string; reason: string },
) {
  requireSalaryPermission(actor, "finance.salary.book");
  const reference = db.collection("salarySlips").doc(input.slipId);
  const snapshot = await reference.get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.organizationId !== actor.organizationId)
    throw new FinanceError("salarySlipMissing", 404);
  if (data.status !== "booked") throw new FinanceError("salarySlipLocked", 409);
  const transactionIds = (data.transactionIds ?? []) as string[];
  for (const transactionId of transactionIds) {
    const transaction = await db
      .collection("financialTransactions")
      .doc(transactionId)
      .get();
    if (transaction.data()?.reversedByTransactionId) continue;
    await voidFinancialTransaction(
      db,
      actor,
      { transactionId, reason: input.reason },
      { salary: true },
    );
  }
  const batch = db.batch();
  batch.update(reference, {
    status: "initiated" satisfies SalarySlipStatus,
    transactionIds: [],
    reversedTransactionIds: FieldValue.arrayUnion(...transactionIds),
    booking: null,
    version: Number(data.version ?? 0) + 1,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.id,
  });
  audit(db, batch, actor, "salarySlip.reversed", input.slipId, {
    reason: input.reason,
  });
  await batch.commit();
}
