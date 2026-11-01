import "server-only";

import {
  emailPreferencesFrom,
  notificationLocale,
} from "@/domain/notifications";
import type { CompensationRecord } from "@/domain/finance/compensation";
import type { ManagedUser } from "./UserManagement";

export async function financeEnabled(
  db: FirebaseFirestore.Firestore,
  organizationId: string,
) {
  const organization = await db
    .collection("organizations")
    .doc(organizationId)
    .get();
  return organization.data()?.financeEnabled === true;
}

export async function compensationHistory(
  db: FirebaseFirestore.Firestore,
  organizationId: string,
  userId: string,
): Promise<CompensationRecord[]> {
  const snapshot = await db
    .collection("compensationAgreements")
    .where("organizationId", "==", organizationId)
    .where("userId", "==", userId)
    .orderBy("validFrom", "desc")
    .get();
  return snapshot.docs.map((document) => ({
    id: document.id,
    userId: String(document.data().userId),
    model: document.data().model as CompensationRecord["model"],
    validFrom: String(document.data().validFrom),
    validTo: document.data().validTo ?? null,
    shareBps: Number(document.data().shareBps ?? 0),
    fixedMonthlySalaryMinor: document.data().fixedMonthlySalaryMinor ?? null,
  }));
}

export function toManagedUser(
  doc: FirebaseFirestore.DocumentSnapshot,
): ManagedUser {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    displayName: String(data.displayName),
    email: String(data.email),
    employeeNumber: String(data.employeeNumber),
    role: String(data.role),
    reportsTime:
      data.reportsTime ??
      ["employee", "consultant"].includes(String(data.role)),
    status: String(data.status),
    createdAt: data.createdAt?.toMillis?.() ?? 0,
    employmentStartDate: String(data.employmentStartDate ?? ""),
    employmentEndDate: String(data.employmentEndDate ?? ""),
    reportingStartDate: String(data.reportingStartDate ?? ""),
    financeAccess: {
      enabled: data.financeAccess?.enabled === true,
      myFinance: data.financeAccess?.myFinance === true,
      myInvoices: data.financeAccess?.myInvoices === true,
    },
    documentAccess: {
      contracts: data.documentAccess?.contracts === true,
      payslips: data.documentAccess?.payslips === true,
      receipts: data.documentAccess?.receipts === true,
    },
    emailPreferences: emailPreferencesFrom(data.emailPreferences),
    locale: notificationLocale(data.locale),
  };
}
