import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import type { SalaryLine } from "@/domain/salary/articles";
import type {
  SalarySlipProblem,
  SalarySlipStatus,
  SalarySlipTax,
} from "@/domain/salary/slip";
import type { SalaryTotals } from "@/domain/salary/totals";
import type { CompensationModel, TimeCategory } from "@/domain/types";

/** Reported time of one kind: its total and the minutes per category. */
export interface SalaryTimeGroup {
  minutes: number;
  categories: Array<{ category: TimeCategory; minutes: number }>;
}

/** Time reported in a row's event period, approved or not yet. */
export interface SalaryTimeSummary {
  approved: SalaryTimeGroup;
  notApproved: SalaryTimeGroup & {
    /** Weeks that still wait for submission or approval. */
    weeks: number;
  };
}

const CATEGORY_ORDER: TimeCategory[] = [
  "work",
  "overtime",
  "vacation",
  "sick_leave",
  "care_leave",
  "parental_leave",
  "unpaid_leave",
  "compensatory_leave",
  "holiday",
  "other",
];

function groupFrom(minutes: Map<TimeCategory, number>): SalaryTimeGroup {
  const categories = CATEGORY_ORDER.filter((category) =>
    minutes.get(category),
  ).map((category) => ({ category, minutes: minutes.get(category)! }));
  return {
    minutes: categories.reduce((sum, item) => sum + item.minutes, 0),
    categories,
  };
}

/** Approved and not yet approved time of a person between two dates. */
export async function loadTimeSummary(
  db: Firestore,
  organizationId: string,
  userId: string,
  from: string,
  to: string,
): Promise<SalaryTimeSummary> {
  const entries = await db
    .collection("timeEntries")
    .where("organizationId", "==", organizationId)
    .where("userId", "==", userId)
    .where("date", ">=", from)
    .where("date", "<=", to)
    .get();
  const data = entries.docs.map((document) => document.data());
  const sheetIds = [...new Set(data.map((item) => String(item.timesheetId)))];
  const sheets = sheetIds.length
    ? await db.getAll(
        ...sheetIds.map((id) => db.collection("timesheets").doc(id)),
      )
    : [];
  const approvedSheets = new Set(
    sheets
      .filter(
        (sheet) =>
          sheet.data()?.organizationId === organizationId &&
          sheet.data()?.status === "approved",
      )
      .map((sheet) => sheet.id),
  );
  const approved = new Map<TimeCategory, number>();
  const pending = new Map<TimeCategory, number>();
  const pendingSheets = new Set<string>();
  for (const item of data) {
    const sheet = String(item.timesheetId);
    const category = String(
      item.timeCodeSnapshot?.category ?? "other",
    ) as TimeCategory;
    const target = approvedSheets.has(sheet) ? approved : pending;
    if (!approvedSheets.has(sheet)) pendingSheets.add(sheet);
    target.set(
      category,
      (target.get(category) ?? 0) + Number(item.minutes ?? 0),
    );
  }
  return {
    approved: groupFrom(approved),
    notApproved: { ...groupFrom(pending), weeks: pendingSheets.size },
  };
}

/** What the salary pages show of one salary row. */
export interface SalaryRow {
  id: string;
  userId: string;
  period: string;
  paymentDate: string;
  eventFrom: string;
  eventTo: string;
  name: string;
  employeeNumber: string;
  model: CompensationModel;
  fundedByConsultant: boolean;
  status: SalarySlipStatus;
  problem: SalarySlipProblem;
  lines: SalaryLine[];
  tax: SalarySlipTax;
  totals: SalaryTotals;
  payslipId: string | null;
  version: number;
  /** Whether vacation and leave come from time reports. */
  useTimeReports: boolean;
  /** Days with approved time in the event period. */
  reportedDays: number;
  /** One-time payments booked earlier in the year, in öre. */
  oneTimeEarlierMinor: number;
  /** A flexible consultant's balance before this salary, in öre. */
  balanceMinor: number | null;
}

export interface SalaryRunInfo {
  paymentDate: string;
  eventFrom: string;
  eventTo: string;
  /** People left out of the month on purpose. */
  excludedUserIds: string[];
}

function rowFrom(
  id: string,
  data: FirebaseFirestore.DocumentData,
): Omit<SalaryRow, "balanceMinor"> {
  return {
    id,
    userId: String(data.userId),
    period: String(data.period),
    paymentDate: String(data.paymentDate),
    eventFrom: String(data.eventFrom),
    eventTo: String(data.eventTo),
    name: String(data.person?.displayName ?? ""),
    employeeNumber: String(data.person?.employeeNumber ?? ""),
    model: data.model,
    fundedByConsultant: data.fundedByConsultant === true,
    status: data.status,
    problem: data.problem ?? null,
    lines: Array.isArray(data.lines) ? data.lines : [],
    tax: data.tax,
    totals: data.totals,
    payslipId: data.payslipId ?? null,
    version: Number(data.version ?? 0),
    useTimeReports: data.useTimeReports !== false,
    reportedDays: Number(data.reportedDays ?? 0),
    oneTimeEarlierMinor: Number(data.yearToDate?.oneTimeMinor ?? 0),
  };
}

/** A consultant's balance: the sum of their balance changes in the ledger. */
async function consultantBalance(
  db: Firestore,
  organizationId: string,
  userId: string,
) {
  const snapshot = await db
    .collection("financialTransactions")
    .where("organizationId", "==", organizationId)
    .where("consultantId", "==", userId)
    .get();
  return snapshot.docs.reduce(
    (sum, document) =>
      sum + Number(document.data().consultantBalanceDeltaMinor ?? 0),
    0,
  );
}

export async function loadSalaryRun(
  db: Firestore,
  organizationId: string,
  period: string,
): Promise<{ run: SalaryRunInfo | null; rows: SalaryRow[] }> {
  const [run, slips] = await Promise.all([
    db.collection("salaryRuns").doc(`${organizationId}_${period}`).get(),
    db
      .collection("salarySlips")
      .where("organizationId", "==", organizationId)
      .where("period", "==", period)
      .get(),
  ]);
  const rows = await Promise.all(
    slips.docs.map(async (document) => {
      const row = rowFrom(document.id, document.data());
      return {
        ...row,
        balanceMinor:
          row.fundedByConsultant && row.status !== "booked"
            ? await consultantBalance(db, organizationId, row.userId)
            : null,
      };
    }),
  );
  const data = run.data();
  return {
    run: data
      ? {
          paymentDate: String(data.paymentDate),
          eventFrom: String(data.eventFrom),
          eventTo: String(data.eventTo),
          excludedUserIds: Array.isArray(data.excludedUserIds)
            ? data.excludedUserIds.map(String)
            : [],
        }
      : null,
    rows: rows.sort((left, right) => left.name.localeCompare(right.name, "sv")),
  };
}

export async function loadSalaryRow(
  db: Firestore,
  organizationId: string,
  period: string,
  userId: string,
): Promise<SalaryRow | null> {
  const snapshot = await db
    .collection("salarySlips")
    .doc(`${organizationId}_${userId}_${period}`)
    .get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.organizationId !== organizationId) return null;
  const row = rowFrom(snapshot.id, data);
  return {
    ...row,
    balanceMinor: row.fundedByConsultant
      ? await consultantBalance(db, organizationId, row.userId)
      : null,
  };
}
