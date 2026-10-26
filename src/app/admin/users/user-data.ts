import "server-only";

import { emailPreferencesFrom } from "@/domain/notifications";
import type { ManagedUser } from "./UserManagement";

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
  };
}
