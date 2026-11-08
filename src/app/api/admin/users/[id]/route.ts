import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  AccessProfileError,
  assertProfileFitsRole,
} from "@/server/services/access-profile-service";
import { accessProfileIdSchema } from "@/server/validators/access-profile";
import {
  emailPreferencesSchema,
  employmentDatesValid,
  localeSchema,
} from "@/server/validators/user-access";
import { canBePaidSalary } from "@/domain/finance/compensation";
import {
  loadPayrollProfile,
  writePayrollProfile,
} from "@/server/services/payroll-service";
import { payrollProfileSchema } from "@/server/validators/payroll";
import { vacationSettingsSchema } from "@/server/validators/vacation";
import { vacationSettingsFrom } from "@/server/services/vacation-service";

const updateSchema = z
  .object({
    displayName: z.string().trim().min(2).max(100),
    email: z.email(),
    employeeNumber: z.string().trim().min(1).max(30),
    role: z.enum(["employee", "consultant", "manager", "accountant", "admin"]),
    reportsTime: z.boolean(),
    status: z.enum(["active", "inactive"]),
    employmentStartDate: z.iso.date().nullable(),
    employmentEndDate: z.iso.date().nullable(),
    reportingStartDate: z.iso.date().nullable(),
    accessProfileId: accessProfileIdSchema.nullable(),
    emailPreferences: emailPreferencesSchema.optional(),
    locale: localeSchema,
    vacation: vacationSettingsSchema.nullable().optional(),
    paysSalary: z.boolean().optional(),
    payroll: payrollProfileSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.role === "admin" && value.vacation)
      context.addIssue({
        code: "custom",
        message: "Vacation is not tracked for administrators",
      });
    if (
      !employmentDatesValid(value.employmentStartDate, value.employmentEndDate)
    )
      context.addIssue({
        code: "custom",
        message: "The employment end date cannot be before the start date",
      });
  });

/** Only staff roles are marked as paid; consultants always are. */
function payrollStaff(value: { role: string; paysSalary?: boolean }) {
  return canBePaidSalary(value.role) && value.paysSalary === true;
}

async function loadTarget(id: string) {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin") return { error: "FORBIDDEN" as const };
  const { auth, db } = getAdminServices();
  const target = await db.collection("users").doc(id).get();
  if (!target.exists) return { error: "NOT_FOUND" as const };
  if (target.data()?.organizationId !== actor.organizationId)
    return { error: "FORBIDDEN" as const };
  return { actor, auth, db, target };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const loaded = await loadTarget(id);
  if ("error" in loaded)
    return NextResponse.json(
      {
        error: loaded.error === "NOT_FOUND" ? "User not found." : "Forbidden.",
      },
      { status: loaded.error === "NOT_FOUND" ? 404 : 403 },
    );
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Check the employee details and try again." },
      { status: 400 },
    );
  if (id === loaded.actor.id) {
    const current = loaded.target.data()!;
    if (
      parsed.data.employeeNumber !== current.employeeNumber ||
      parsed.data.role !== current.role ||
      parsed.data.reportsTime !==
        (current.reportsTime ??
          ["employee", "consultant"].includes(String(current.role))) ||
      parsed.data.status !== current.status ||
      parsed.data.employmentEndDate !== (current.employmentEndDate ?? null)
    )
      return NextResponse.json(
        { error: "You can only change your own full name and email." },
        { status: 403 },
      );
  }

  try {
    await assertProfileFitsRole(
      loaded.db,
      loaded.actor.organizationId,
      parsed.data.role,
      parsed.data.accessProfileId,
    );
    await loaded.auth.updateUser(id, {
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      disabled: parsed.data.status === "inactive",
    });
    await loaded.auth.setCustomUserClaims(id, {
      role: parsed.data.role,
      reportsTime:
        parsed.data.role === "consultant" ||
        parsed.data.role === "employee" ||
        (["manager", "accountant"].includes(parsed.data.role) &&
          parsed.data.reportsTime),
      organizationId: loaded.actor.organizationId,
    });
    const vacation = parsed.data.role === "admin" ? null : parsed.data.vacation;
    const previousPayroll = parsed.data.payroll
      ? await loadPayrollProfile(loaded.db, loaded.actor.organizationId, id)
      : null;
    const batch = loaded.db.batch();
    if (parsed.data.payroll && previousPayroll)
      writePayrollProfile(
        loaded.db,
        batch,
        {
          organizationId: loaded.actor.organizationId,
          actorId: loaded.actor.id,
          userId: id,
        },
        previousPayroll,
        parsed.data.payroll,
      );
    batch.update(loaded.target.ref, {
      displayName: parsed.data.displayName,
      email: parsed.data.email,
      employeeNumber: parsed.data.employeeNumber,
      role: parsed.data.role,
      reportsTime:
        parsed.data.role === "consultant" ||
        parsed.data.role === "employee" ||
        (["manager", "accountant"].includes(parsed.data.role) &&
          parsed.data.reportsTime),
      status: parsed.data.status,
      employmentStartDate: parsed.data.employmentStartDate,
      employmentEndDate: parsed.data.employmentEndDate,
      reportingStartDate: parsed.data.reportingStartDate,
      accessProfileId: parsed.data.accessProfileId,
      ...(parsed.data.emailPreferences
        ? { emailPreferences: parsed.data.emailPreferences }
        : {}),
      locale: parsed.data.locale,
      ...(vacation !== undefined ? { vacation } : {}),
      ...(parsed.data.paysSalary !== undefined
        ? { paysSalary: payrollStaff(parsed.data) }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (
      vacation !== undefined &&
      JSON.stringify(vacationSettingsFrom(vacation)) !==
        JSON.stringify(vacationSettingsFrom(loaded.target.data()?.vacation))
    )
      batch.create(loaded.db.collection("auditLogs").doc(), {
        organizationId: loaded.actor.organizationId,
        actorUserId: loaded.actor.id,
        action: "vacation.settingsUpdated",
        entityType: "user",
        entityId: id,
        timestamp: FieldValue.serverTimestamp(),
        metadata: { vacation },
      });
    batch.create(loaded.db.collection("auditLogs").doc(), {
      organizationId: loaded.actor.organizationId,
      actorUserId: loaded.actor.id,
      action: "user.updated",
      entityType: "user",
      entityId: id,
      timestamp: FieldValue.serverTimestamp(),
      metadata: {
        role: parsed.data.role,
        status: parsed.data.status,
        employmentStartDate: parsed.data.employmentStartDate,
        employmentEndDate: parsed.data.employmentEndDate,
        reportingStartDate: parsed.data.reportingStartDate,
        accessProfileId: parsed.data.accessProfileId,
        ...(parsed.data.emailPreferences
          ? { emailPreferences: parsed.data.emailPreferences }
          : {}),
        locale: parsed.data.locale,
        ...(parsed.data.paysSalary !== undefined
          ? { paysSalary: payrollStaff(parsed.data) }
          : {}),
      },
    });
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessProfileError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    return NextResponse.json(
      {
        error:
          code === "auth/email-already-exists"
            ? "That email address is already used by another account."
            : "The employee could not be updated. Please try again.",
      },
      { status: code === "auth/email-already-exists" ? 409 : 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const loaded = await loadTarget(id);
  if ("error" in loaded)
    return NextResponse.json(
      {
        error: loaded.error === "NOT_FOUND" ? "User not found." : "Forbidden.",
      },
      { status: loaded.error === "NOT_FOUND" ? 404 : 403 },
    );
  if (id === loaded.actor.id)
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 409 },
    );
  const confirmation = (await request.json().catch(() => null)) as {
    confirmation?: unknown;
  } | null;
  if (confirmation?.confirmation !== "I am sure")
    return NextResponse.json(
      { error: 'Type "I am sure" to confirm deletion.' },
      { status: 400 },
    );

  try {
    const batch = loaded.db.batch();
    batch.delete(loaded.target.ref);
    batch.create(loaded.db.collection("auditLogs").doc(), {
      organizationId: loaded.actor.organizationId,
      actorUserId: loaded.actor.id,
      action: "user.deleted",
      entityType: "user",
      entityId: id,
      timestamp: FieldValue.serverTimestamp(),
      metadata: {},
    });
    await batch.commit();
    await loaded.auth.deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "The employee could not be deleted. Please try again." },
      { status: 500 },
    );
  }
}
