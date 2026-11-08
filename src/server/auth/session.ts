import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { cookies } from "next/headers";
import { cache } from "react";
import { receivesSalary } from "@/domain/finance/compensation";
import { canImpersonate, IMPERSONATION_COOKIE } from "@/domain/impersonation";
import type { PortalUser } from "@/domain/types";
import { getAdminServices } from "@/lib/firebase/admin";
import { hasSecondFactor, isMfaRequired } from "@/server/auth/mfa";
import { permissionsOf } from "@/server/auth/permissions";

export const SESSION_COOKIE = "__session";
export const SESSION_DURATION_MS = 5 * 24 * 60 * 60 * 1_000;

async function loadPortalUser(
  db: Firestore,
  uid: string,
): Promise<PortalUser | null> {
  const snapshot = await db.collection("users").doc(uid).get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.status !== "active") return null;
  let compensationModel = data.compensationModel ?? null;
  if (
    receivesSalary({ role: String(data.role), paysSalary: data.paysSalary })
  ) {
    const currentDate = new Date().toISOString().slice(0, 10);
    const agreement = await db
      .collection("compensationAgreements")
      .where("organizationId", "==", data.organizationId)
      .where("userId", "==", uid)
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
    id: uid,
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
    paysSalary: data.paysSalary === true,
    emailPreferences: {
      receipts: data.emailPreferences?.receipts !== false,
      payslips: data.emailPreferences?.payslips !== false,
      timesheets: data.emailPreferences?.timesheets !== false,
    },
    accessProfileId: data.accessProfileId ?? null,
    permissions: await permissionsOf(db, {
      role: data.role,
      organizationId: data.organizationId,
      accessProfileId: data.accessProfileId,
    }),
  } as PortalUser;
}

export const verifySession = cache(
  async function verifySession(): Promise<PortalUser | null> {
    const store = await cookies();
    const value = store.get(SESSION_COOKIE)?.value;
    if (!value) return null;
    try {
      const { auth, db } = getAdminServices();
      const token = await auth.verifySessionCookie(value, true);
      if (isMfaRequired() && !hasSecondFactor(token)) return null;
      const user = await loadPortalUser(db, token.uid);
      const viewedId = store.get(IMPERSONATION_COOKIE)?.value;
      if (!user || !viewedId || user.role !== "admin") return user;
      // The cookie only names who to view; the real session must allow it.
      const viewed = await loadPortalUser(db, viewedId);
      return viewed && canImpersonate(user, viewed)
        ? {
            ...viewed,
            impersonatedBy: { id: user.id, displayName: user.displayName },
          }
        : user;
    } catch {
      return null;
    }
  },
);
