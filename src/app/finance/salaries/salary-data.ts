import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import type { SalaryLine } from "@/domain/salary/articles";
import type {
  SalarySlipProblem,
  SalarySlipStatus,
  SalarySlipTax,
} from "@/domain/salary/slip";
import type { SalaryTotals } from "@/domain/salary/totals";
import type { CompensationModel } from "@/domain/types";

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
  /** A flexible consultant's balance before this salary, in öre. */
  balanceMinor: number | null;
}

export interface SalaryRunInfo {
  paymentDate: string;
  eventFrom: string;
  eventTo: string;
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
