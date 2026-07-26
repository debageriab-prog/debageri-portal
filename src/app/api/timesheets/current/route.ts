import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminServices } from "@/lib/firebase/admin";
import { getIsoWeek, getIsoWeekDates, timesheetId } from "@/lib/dates/iso-week";
import { verifySession } from "@/server/auth/session";
import type { TimeCode, Timesheet } from "@/domain/types";

const saveSchema = z.object({
  entries: z
    .array(
      z.object({
        date: z.iso.date(),
        timeCodeId: z.string().min(1),
        minutes: z.number().int().positive().max(1440),
        comment: z.string().trim().max(500).nullable(),
      }),
    )
    .max(100),
});

async function loadCurrent() {
  const user = await verifySession();
  if (!user) return null;
  const { db } = getAdminServices();
  const today = new Date().toISOString().slice(0, 10);
  const { isoYear, isoWeek } = getIsoWeek(today);
  const dates = getIsoWeekDates(isoYear, isoWeek);
  const id = timesheetId(user.organizationId, user.id, isoYear, isoWeek);
  const [sheetDoc, termDocs, codeDocs] = await Promise.all([
    db.collection("timesheets").doc(id).get(),
    db.collection("employmentTerms").where("userId", "==", user.id).get(),
    db
      .collection("timeCodes")
      .where("organizationId", "==", user.organizationId)
      .get(),
  ]);
  const term = termDocs.docs
    .map((doc) => doc.data())
    .filter(
      (item) =>
        item.validFrom <= dates[6]! &&
        (!item.validTo || item.validTo >= dates[0]!),
    )
    .sort((a, b) => String(b.validFrom).localeCompare(String(a.validFrom)))[0];
  if (!term)
    return { user, error: "No active employment terms are configured." };
  let sheet = sheetDoc.data() as Omit<Timesheet, "id"> | undefined;
  if (!sheetDoc.exists) {
    const newSheet = {
      organizationId: user.organizationId,
      userId: user.id,
      managerId: user.managerId,
      isoYear,
      isoWeek,
      periodStart: dates[0]!,
      periodEnd: dates[6]!,
      status: "draft" as const,
      expectedMinutes: term.weeklyMinutes,
      reportedMinutes: 0,
      workedMinutes: 0,
      absenceMinutes: 0,
      rejectionReason: null,
      version: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await db.collection("timesheets").doc(id).create(newSheet);
    sheet = newSheet;
  }
  const entryDocs = await db
    .collection("timeEntries")
    .where("timesheetId", "==", id)
    .get();
  const codes = codeDocs.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as TimeCode)
    .filter((code) => code.active && code.employeeCanSelect)
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
  return {
    user,
    id,
    dates,
    schedule: term.schedule,
    sheet: { id, ...sheet },
    entries: entryDocs.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    codes,
  };
}

export async function GET() {
  const data = await loadCurrent();
  if (!data)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  if ("error" in data)
    return NextResponse.json({ error: data.error }, { status: 409 });
  return NextResponse.json({ data });
}

export async function PUT(request: Request) {
  const loaded = await loadCurrent();
  if (!loaded)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  if ("error" in loaded)
    return NextResponse.json({ error: loaded.error }, { status: 409 });
  if (!["draft", "rejected", "reopened"].includes(String(loaded.sheet.status)))
    return NextResponse.json(
      { error: "This timesheet is not editable." },
      { status: 409 },
    );
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid time entries." },
      { status: 400 },
    );
  const dateSet = new Set(loaded.dates);
  const codeMap = new Map(loaded.codes.map((code) => [String(code.id), code]));
  if (
    parsed.data.entries.some(
      (entry) => !dateSet.has(entry.date) || !codeMap.has(entry.timeCodeId),
    )
  )
    return NextResponse.json(
      { error: "An entry contains an invalid date or time code." },
      { status: 400 },
    );

  const { db } = getAdminServices();
  const existing = await db
    .collection("timeEntries")
    .where("timesheetId", "==", loaded.id)
    .get();
  const batch = db.batch();
  existing.docs.forEach((doc) => batch.delete(doc.ref));
  let reportedMinutes = 0,
    workedMinutes = 0,
    absenceMinutes = 0;
  for (const entry of parsed.data.entries) {
    const code = codeMap.get(entry.timeCodeId)!;
    reportedMinutes += entry.minutes;
    if (code.countsAsWorkedTime) workedMinutes += entry.minutes;
    else absenceMinutes += entry.minutes;
    const date = new Date(`${entry.date}T12:00:00Z`);
    batch.create(db.collection("timeEntries").doc(), {
      organizationId: loaded.user.organizationId,
      timesheetId: loaded.id,
      userId: loaded.user.id,
      date: entry.date,
      isoYear: loaded.sheet.isoYear,
      isoWeek: loaded.sheet.isoWeek,
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      timeCodeId: entry.timeCodeId,
      timeCodeSnapshot: {
        code: code.code,
        name: code.name?.sv ?? code.code,
        category: code.category,
        countsAsWorkedTime: code.countsAsWorkedTime,
        countsTowardExpectedTime: code.countsTowardExpectedTime,
      },
      minutes: entry.minutes,
      comment: entry.comment || null,
      projectId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  batch.update(db.collection("timesheets").doc(loaded.id), {
    reportedMinutes,
    workedMinutes,
    absenceMinutes,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return NextResponse.json({ ok: true });
}
