import "server-only";

import { cookies } from "next/headers";
import type { PortalUser } from "@/domain/types";
import { getAdminServices } from "@/lib/firebase/admin";

export const SESSION_COOKIE = "__session";
export const SESSION_DURATION_MS = 5 * 24 * 60 * 60 * 1_000;

export async function verifySession(): Promise<PortalUser | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  try {
    const { auth, db } = getAdminServices();
    const token = await auth.verifySessionCookie(value, true);
    const snapshot = await db.collection("users").doc(token.uid).get();
    const data = snapshot.data();
    if (!snapshot.exists || data?.status !== "active") return null;
    let compensationModel = data.compensationModel ?? null;
    if (data.role === "consultant") {
      const currentDate = new Date().toISOString().slice(0, 10);
      const agreement = await db
        .collection("compensationAgreements")
        .where("organizationId", "==", data.organizationId)
        .where("userId", "==", token.uid)
        .where("validFrom", "<=", currentDate)
        .orderBy("validFrom", "desc")
        .limit(1)
        .get();
      const current = agreement.docs[0]?.data();
      compensationModel =
        current && (!current.validTo || current.validTo >= currentDate)
          ? current.model
          : null;
    }
    return {
      id: token.uid,
      organizationId: data.organizationId,
      employeeNumber: data.employeeNumber,
      email: data.email,
      displayName: data.displayName,
      role: data.role,
      status: data.status,
      managerId: data.managerId ?? null,
      reportsTime:
        data.reportsTime ??
        ["employee", "consultant"].includes(String(data.role)),
      employmentStartDate: data.employmentStartDate ?? null,
      employmentEndDate: data.employmentEndDate ?? null,
      reportingStartDate: data.reportingStartDate ?? null,
      timezone: data.timezone,
      locale: data.locale,
      compensationModel,
      financeAccess: {
        enabled: data.financeAccess?.enabled === true,
        myFinance: data.financeAccess?.myFinance === true,
        myInvoices: data.financeAccess?.myInvoices === true,
      },
      documentAccess: {
        contracts: data.documentAccess?.contracts === true,
      },
    } as PortalUser;
  } catch {
    return null;
  }
}
