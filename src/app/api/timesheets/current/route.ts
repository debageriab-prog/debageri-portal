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

const weekQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2200).optional(),
  week: z.coerce.number().int().min(1).max(53).optional(),
  copyYear: z.coerce.number().int().min(2000).max(2200).optional(),
  copyWeek: z.coerce.number().int().min(1).max(53).optional(),
});

async function loadCurrent(request: Request) {
  const user = await verifySession();
  if (!user) return null;
  const { db } = getAdminServices();
  const today = new Date().toISOString().slice(0, 10);
  const current = getIsoWeek(today);
  const url = new URL(request.url);
  const query = weekQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success) return { user, error: "Invalid week selection." };
  const isoYear = query.data.year ?? current.isoYear;
  const isoWeek = query.data.week ?? current.isoWeek;
  let dates: string[];
  try {
    dates = getIsoWeekDates(isoYear, isoWeek);
  } catch {
    return { user, error: "The selected ISO week does not exist." };
  }
  const id = timesheetId(user.organizationId, user.id, isoYear, isoWeek);
  const [sheetDoc, termDocs, codeDocs, holidayDocs] = await Promise.all([
    db.collection("timesheets").doc(id).get(),
    db.collection("employmentTerms").where("userId", "==", user.id).get(),
    db
      .collection("timeCodes")
      .where("organizationId", "==", user.organizationId)
      .get(),
    db
      .collection("holidays")
      .where("organizationId", "==", user.organizationId)
      .get(),
  ]);
  const holidayNames = new Map(
    holidayDocs.docs.map((doc) => [
      String(doc.data().date),
      String(doc.data().name),
    ]),
  );
  const redDays = dates.map((date, index) => ({
    date,
    isRed: index >= 5 || holidayNames.has(date),
    reason: holidayNames.get(date) ?? (index >= 5 ? "Weekend" : null),
  }));
  const term = termDocs.docs
    .map((doc) => doc.data())
    .filter(
      (item) =>
        item.validFrom <= dates[6]! &&
        (!item.validTo || item.validTo >= dates[0]!) &&
        String(item.reportingStartDate ?? item.validFrom) <= dates[6]!,
    )
    .sort((a, b) => String(b.validFrom).localeCompare(String(a.validFrom)))[0];
  if (!term)
    return { user, error: "No active employment terms are configured." };
  const scheduleKeys = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  const expectedMinutes = dates.reduce((total, date, index) => {
    const begins = String(term.reportingStartDate ?? term.validFrom);
    if (
      date < begins ||
      (term.validTo && date > term.validTo) ||
      redDays[index]?.isRed
    )
      return total;
    return total + Number(term.schedule?.[scheduleKeys[index]!] ?? 0);
  }, 0);
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
      expectedMinutes,
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
  } else if (
    sheet?.status === "draft" &&
    sheet?.expectedMinutes !== expectedMinutes
  ) {
    await sheetDoc.ref.update({
      expectedMinutes,
      updatedAt: FieldValue.serverTimestamp(),
    });
    sheet = { ...sheet!, expectedMinutes };
  }
  const entryDocs = await db
    .collection("timeEntries")
    .where("timesheetId", "==", id)
    .get();
  const codes = codeDocs.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as TimeCode)
    .filter(
      (code) =>
        code.active &&
        code.employeeCanSelect !== false &&
        (!code.assignedUserId || code.assignedUserId === user.id),
    )
    .sort((a, b) => {
      const rank = (code: TimeCode) =>
        code.category === "work" ? 0 : code.category === "vacation" ? 1 : 2;
      return (
        rank(a) - rank(b) ||
        Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) ||
        a.id.localeCompare(b.id)
      );
    });
  let copyEntries: Array<Record<string, unknown>> = [];
  if (query.data.copyYear && query.data.copyWeek) {
    try {
      const copyDates = getIsoWeekDates(
        query.data.copyYear,
        query.data.copyWeek,
      );
      const copyId = timesheetId(
        user.organizationId,
        user.id,
        query.data.copyYear,
        query.data.copyWeek,
      );
      const sourceEntries = await db
        .collection("timeEntries")
        .where("timesheetId", "==", copyId)
        .get();
      const allowedCodes = new Set(codes.map((code) => code.id));
      copyEntries = sourceEntries.docs
        .map((doc) => doc.data())
        .filter((entry) => allowedCodes.has(String(entry.timeCodeId)))
        .map((entry) => ({
          ...entry,
          id: `copy-${crypto.randomUUID()}`,
          date: dates[copyDates.indexOf(String(entry.date))],
        }))
        .filter((entry) => Boolean(entry.date));
    } catch {
      return { user, error: "The copy-from week does not exist." };
    }
  }
  return {
    user,
    id,
    dates,
    redDays,
    schedule: term.schedule,
    sheet: { id, ...sheet },
    entries: entryDocs.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    copyEntries,
    codes,
  };
}

export async function GET(request: Request) {
  const data = await loadCurrent(request);
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
  const loaded = await loadCurrent(request);
  if (!loaded)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  if ("error" in loaded)
    return NextResponse.json({ error: loaded.error }, { status: 409 });
  if (loaded.sheet.status !== "draft")
    return NextResponse.json(
      {
        error:
          "You already reported this week. Delete the existing draft if you want to report again, or edit that draft.",
      },
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
        hourlyRate: Number(code.hourlyRate ?? 0),
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
