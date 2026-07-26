import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";

const inputSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  email: z.email(),
  employeeNumber: z.string().trim().min(1).max(30),
  password: z.string().min(8).max(128),
  weeklyHours: z.number().positive().max(168),
  employmentStartDate: z.iso.date(),
  reportingStartDate: z.iso.date(),
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
    const created = await auth.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      displayName: parsed.data.displayName,
    });
    uid = created.uid;
    await auth.setCustomUserClaims(uid, {
      role: "employee",
      organizationId: actor.organizationId,
    });
    const weeklyMinutes = Math.round(parsed.data.weeklyHours * 60);
    const dailyMinutes = Math.floor(weeklyMinutes / 5);
    const remainder = weeklyMinutes - dailyMinutes * 5;
    const batch = db.batch();
    batch.create(db.collection("users").doc(uid), {
      organizationId: actor.organizationId,
      employeeNumber: parsed.data.employeeNumber,
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      role: "employee",
      status: "active",
      managerId: actor.id,
      timezone: actor.timezone,
      locale: actor.locale,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.create(db.collection("employmentTerms").doc(), {
      organizationId: actor.organizationId,
      userId: uid,
      validFrom: parsed.data.employmentStartDate,
      validTo: null,
      reportingStartDate: parsed.data.reportingStartDate,
      employmentPercentage: Math.round((weeklyMinutes / 2400) * 100),
      weeklyMinutes,
      schedule: {
        monday: dailyMinutes + remainder,
        tuesday: dailyMinutes,
        wednesday: dailyMinutes,
        thursday: dailyMinutes,
        friday: dailyMinutes,
        saturday: 0,
        sunday: 0,
      },
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.id,
    });
    batch.create(db.collection("auditLogs").doc(), {
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      action: "user.created",
      entityType: "user",
      entityId: uid,
      timestamp: FieldValue.serverTimestamp(),
      metadata: { role: "employee" },
    });
    await batch.commit();
    return NextResponse.json({ id: uid }, { status: 201 });
  } catch (error) {
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
