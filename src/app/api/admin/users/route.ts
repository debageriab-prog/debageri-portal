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
  localeSchema,
} from "@/server/validators/user-access";
import {
  vacationOpeningSchema,
  vacationSettingsSchema,
} from "@/server/validators/vacation";
import { addVacationSetup } from "@/server/services/vacation-service";
import { stockholmDateTime } from "@/lib/dates/stockholm";
import { canBePaidSalary } from "@/domain/finance/compensation";
import { emptyPayrollProfile } from "@/domain/salary/payroll-profile";
import { writePayrollProfile } from "@/server/services/payroll-service";
import { payrollProfileSchema } from "@/server/validators/payroll";

const inputSchema = z
  .object({
    displayName: z.string().trim().min(2).max(100),
    email: z.email(),
    employeeNumber: z.string().trim().min(1).max(30),
    password: z.string().min(8).max(128),
    role: z.enum(["consultant", "manager", "accountant", "admin"]),
    reportsTime: z.boolean(),
    employmentStartDate: z.iso.date(),
    reportingStartDate: z.iso.date().nullable(),
    accessProfileId: accessProfileIdSchema.nullable(),
    emailPreferences: emailPreferencesSchema.optional(),
    locale: localeSchema,
    vacation: vacationSettingsSchema.nullable().optional(),
    vacationOpening: vacationOpeningSchema.optional(),
    paysSalary: z.boolean().default(false),
    payroll: payrollProfileSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.role === "admin" && value.vacation)
      context.addIssue({
        code: "custom",
        message: "Vacation is not tracked for administrators",
      });
    const expectedReportsTime =
      value.role === "consultant" ||
      (["manager", "accountant"].includes(value.role) && value.reportsTime);
    if (value.reportsTime !== expectedReportsTime)
      context.addIssue({
        code: "custom",
        message: "Invalid time-reporting capability",
      });
    if (value.reportsTime && !value.reportingStartDate)
      context.addIssue({
        code: "custom",
        message: "Reporting details are required",
      });
  });

export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor || actor.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid employee details" },
      { status: 400 },
    );

  const { auth, db } = getAdminServices();
  let uid: string | null = null;
  try {
    await assertProfileFitsRole(
      db,
      actor.organizationId,
      parsed.data.role,
      parsed.data.accessProfileId,
    );
    const created = await auth.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      displayName: parsed.data.displayName,
    });
    uid = created.uid;
    await auth.setCustomUserClaims(uid, {
      role: parsed.data.role,
      organizationId: actor.organizationId,
    });
    const batch = db.batch();
    batch.create(db.collection("users").doc(uid), {
      organizationId: actor.organizationId,
      employeeNumber: parsed.data.employeeNumber,
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      role: parsed.data.role,
      reportsTime: parsed.data.reportsTime,
      employmentStartDate: parsed.data.employmentStartDate,
      employmentEndDate: null,
      reportingStartDate: parsed.data.reportingStartDate,
      accessProfileId: parsed.data.accessProfileId,
      ...(parsed.data.emailPreferences
        ? { emailPreferences: parsed.data.emailPreferences }
        : {}),
      status: "active",
      managerId: null,
      timezone: actor.timezone,
      locale: parsed.data.locale,
      vacation: parsed.data.vacation ?? null,
      paysSalary: canBePaidSalary(parsed.data.role) && parsed.data.paysSalary,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.create(db.collection("auditLogs").doc(), {
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      action: "user.created",
      entityType: "user",
      entityId: uid,
      timestamp: FieldValue.serverTimestamp(),
      metadata: {
        role: parsed.data.role,
        reportsTime: parsed.data.reportsTime,
        accessProfileId: parsed.data.accessProfileId,
        locale: parsed.data.locale,
        vacation: parsed.data.vacation ?? null,
      },
    });
    if (parsed.data.payroll)
      writePayrollProfile(
        db,
        batch,
        {
          organizationId: actor.organizationId,
          actorId: actor.id,
          userId: uid,
        },
        emptyPayrollProfile(),
        parsed.data.payroll,
      );
    if (parsed.data.vacation)
      addVacationSetup(
        db,
        batch,
        {
          organizationId: actor.organizationId,
          userId: uid,
          actorId: actor.id,
          actorName: actor.displayName,
        },
        parsed.data.vacation,
        stockholmDateTime().date,
        parsed.data.vacationOpening ?? { normalMinutes: 0, advanceMinutes: 0 },
      );
    await batch.commit();
    return NextResponse.json({ id: uid }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessProfileError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    if (uid) await auth.deleteUser(uid).catch(() => undefined);
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    const emailExists =
      code === "auth/email-already-exists" ||
      (error instanceof Error &&
        error.message.includes("email-already-exists"));
    const message = emailExists
      ? "That email address is already used by another account."
      : "The employee could not be created. Please try again.";
    return NextResponse.json(
      { error: message },
      { status: emailExists ? 409 : 500 },
    );
  }
}
