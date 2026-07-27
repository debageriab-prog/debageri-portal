import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminServices } from "@/lib/firebase/admin";
import {
  getIsoWeek,
  getIsoWeekDates,
  splitWeekByMonth,
  timesheetPartId,
} from "@/lib/dates/iso-week";
import { verifySession } from "@/server/auth/session";
import type { TimeCode, Timesheet } from "@/domain/types";

const saveSchema = z.object({
  autoApproveNonWorking: z.boolean().optional(),
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
  part: z.coerce.number().int().min(1).max(2).optional(),
});

async function loadCurrent(request: Request) {
  const user = await verifySession();
  if (!user || !user.reportsTime) return null;
  const { db } = getAdminServices();
  const today = new Date().toISOString().slice(0, 10);
  let current = getIsoWeek(today);
  const url = new URL(request.url);
  const query = weekQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success) return { user, error: "Invalid week selection." };
  const existingSheets = await db
    .collection("timesheets")
    .where("userId", "==", user.id)
    .get();
  const latest = existingSheets.docs
    .map((doc) => doc.data())
    .filter((sheet) => sheet.status !== "draft")
    .sort((a, b) => String(b.periodEnd).localeCompare(String(a.periodEnd)))[0];
  if (!query.data.year && !query.data.week) {
    if (latest) {
      const next = new Date(`${latest.periodEnd}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      current = getIsoWeek(next);
    }
  }
  const isoYear = query.data.year ?? current.isoYear;
  const isoWeek = query.data.week ?? current.isoWeek;
  let fullDates: string[];
  try {
    fullDates = getIsoWeekDates(isoYear, isoWeek);
  } catch {
    return { user, error: "The selected ISO week does not exist." };
  }
  const parts = splitWeekByMonth(fullDates);
  const partDocs = await db.getAll(
    ...parts.map((_, index) =>
      db
        .collection("timesheets")
        .doc(
          timesheetPartId(
            user.organizationId,
            user.id,
            isoYear,
            isoWeek,
            index + 1,
            parts.length,
          ),
        ),
    ),
  );
  const selectedPart =
    query.data.part ??
    Math.max(
      1,
      partDocs.findIndex(
        (doc) => !doc.exists || doc.data()?.status === "draft",
      ) + 1 || parts.length,
    );
  if (selectedPart > parts.length)
    return { user, error: "The selected week part does not exist." };
  const dates = parts[selectedPart - 1]!;
  const id = timesheetPartId(
    user.organizationId,
    user.id,
    isoYear,
    isoWeek,
    selectedPart,
    parts.length,
  );
  const sheetDoc = partDocs[selectedPart - 1]!;
  const [codeDocs, holidayDocs] = await Promise.all([
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
  const redDays = dates.map((date) => {
    const weekend = [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());
    return {
      date,
      isRed: weekend || holidayNames.has(date),
      reason: holidayNames.get(date) ?? (weekend ? "Weekend" : null),
    };
  });
  const reportingBegins =
    user.reportingStartDate ?? user.employmentStartDate ?? "0000-01-01";
  const expectedMinutes = dates.reduce((total, date, index) => {
    if (
      date < reportingBegins ||
      (user.employmentEndDate && date > user.employmentEndDate) ||
      redDays[index]?.isRed
    )
      return total;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    return total + (weekday >= 1 && weekday <= 5 ? 480 : 0);
  }, 0);
  let sheet = sheetDoc.data() as Omit<Timesheet, "id"> | undefined;
  if (!sheetDoc.exists) {
    sheet = {
      organizationId: user.organizationId,
      userId: user.id,
      managerId: user.managerId,
      isoYear,
      isoWeek,
      part: selectedPart,
      partCount: parts.length,
      periodStart: dates[0]!,
      periodEnd: dates.at(-1)!,
      status: "draft" as const,
      expectedMinutes,
      reportedMinutes: 0,
      workedMinutes: 0,
      absenceMinutes: 0,
      rejectionReason: null,
      version: 0,
    };
  } else if (
    sheet?.status === "draft" &&
    sheet?.expectedMinutes !== expectedMinutes
  ) {
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
      const sourceEntries = await db
        .collection("timeEntries")
        .where("userId", "==", user.id)
        .get();
      const allowedCodes = new Set(codes.map((code) => code.id));
      copyEntries = sourceEntries.docs
        .map((doc) => doc.data())
        .filter(
          (entry) =>
            Number(entry.isoYear) === query.data.copyYear &&
            Number(entry.isoWeek) === query.data.copyWeek &&
            allowedCodes.has(String(entry.timeCodeId)),
        )
        .map((entry) => ({
          ...entry,
          id: `copy-${crypto.randomUUID()}`,
          date: fullDates[copyDates.indexOf(String(entry.date))],
        }))
        .filter(
          (entry) => Boolean(entry.date) && dates.includes(String(entry.date)),
        );
    } catch {
      return { user, error: "The copy-from week does not exist." };
    }
  }
  return {
    user,
    id,
    sheetExists: sheetDoc.exists,
    dates,
    part: selectedPart,
    partCount: parts.length,
    redDays,
    schedule: {
      monday: 480,
      tuesday: 480,
      wednesday: 480,
      thursday: 480,
      friday: 480,
      saturday: 0,
      sunday: 0,
    },
    sheet: { id, ...sheet },
    entries: entryDocs.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    copyEntries,
    codes,
    latestReported: latest
      ? {
          isoYear: Number(latest.isoYear),
          isoWeek: Number(latest.isoWeek),
          periodStart: String(latest.periodStart),
          periodEnd: String(latest.periodEnd),
        }
      : null,
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

async function saveCurrent(request: Request) {
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
  if (
    loaded.sheet.expectedMinutes === 0 &&
    parsed.data.autoApproveNonWorking === true
  ) {
    if (parsed.data.entries.length > 0)
      return NextResponse.json(
        {
          error: "A zero-hour report cannot contain time entries.",
        },
        { status: 400 },
      );

    const { db } = getAdminServices();
    const existing = await db
      .collection("timeEntries")
      .where("timesheetId", "==", loaded.id)
      .get();
    const batch = db.batch();
    existing.docs.forEach((doc) => batch.delete(doc.ref));
    const now = FieldValue.serverTimestamp();
    const sheetRef = db.collection("timesheets").doc(loaded.id);
    const approvedValues = {
      expectedMinutes: 0,
      reportedMinutes: 0,
      workedMinutes: 0,
      absenceMinutes: 0,
      status: "approved",
      rejectionReason: null,
      version: Number(loaded.sheet.version ?? 0) + 1,
      submittedAt: now,
      submittedBy: loaded.user.id,
      reviewedAt: now,
      reviewedBy: loaded.user.id,
      updatedAt: now,
    };
    if (loaded.sheetExists) {
      batch.update(sheetRef, approvedValues);
    } else {
      batch.create(sheetRef, {
        organizationId: loaded.user.organizationId,
        userId: loaded.user.id,
        managerId: loaded.user.managerId,
        isoYear: loaded.sheet.isoYear,
        isoWeek: loaded.sheet.isoWeek,
        part: loaded.part,
        partCount: loaded.partCount,
        periodStart: loaded.dates[0],
        periodEnd: loaded.dates.at(-1),
        ...approvedValues,
        createdAt: now,
      });
    }
    batch.create(db.collection("approvalEvents").doc(), {
      organizationId: loaded.user.organizationId,
      timesheetId: loaded.id,
      userId: loaded.user.id,
      action: "approved",
      fromStatus: "draft",
      toStatus: "approved",
      comment: "Automatically approved because the period has no working days.",
      performedBy: loaded.user.id,
      performedAt: now,
      timesheetVersion: approvedValues.version,
    });
    batch.create(db.collection("auditLogs").doc(), {
      organizationId: loaded.user.organizationId,
      actorUserId: loaded.user.id,
      action: "timesheet.auto_approved_non_working",
      entityType: "timesheet",
      entityId: loaded.id,
      timestamp: now,
      metadata: {
        isoYear: loaded.sheet.isoYear,
        isoWeek: loaded.sheet.isoWeek,
        part: loaded.part,
      },
    });
    await batch.commit();
    return NextResponse.json({ ok: true, status: "approved" });
  }
  if (loaded.sheet.expectedMinutes === 0 && parsed.data.entries.length === 0)
    return NextResponse.json(
      {
        error:
          "This period contains only non-working days. Confirm reporting 0 hours to continue.",
      },
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
  const redDateSet = new Set(
    loaded.redDays.filter((day) => day.isRed).map((day) => day.date),
  );
  if (
    parsed.data.entries.some(
      (entry) =>
        redDateSet.has(entry.date) &&
        codeMap.get(entry.timeCodeId)?.countsAsWorkedTime !== true,
    )
  )
    return NextResponse.json(
      {
        error:
          "Only working-time codes can be reported on red or non-working days.",
      },
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
    const countsAsWorkedTime = code.countsAsWorkedTime === true;
    const countsTowardExpectedTime = code.countsTowardExpectedTime !== false;
    const category = code.category ?? (countsAsWorkedTime ? "work" : "other");
    const localizedName =
      typeof code.name === "string"
        ? code.name
        : (code.name?.sv ?? code.name?.en ?? code.code);
    reportedMinutes += entry.minutes;
    if (countsAsWorkedTime) workedMinutes += entry.minutes;
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
        name: localizedName,
        category,
        countsAsWorkedTime,
        countsTowardExpectedTime,
        hourlyRate: Number(code.hourlyRate ?? 0),
      },
      minutes: entry.minutes,
      comment: entry.comment || null,
      projectId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  const sheetRef = db.collection("timesheets").doc(loaded.id);
  const totals = {
    expectedMinutes: loaded.sheet.expectedMinutes,
    reportedMinutes,
    workedMinutes,
    absenceMinutes,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (loaded.sheetExists) {
    batch.update(sheetRef, totals);
  } else {
    batch.create(sheetRef, {
      organizationId: loaded.user.organizationId,
      userId: loaded.user.id,
      managerId: loaded.user.managerId,
      isoYear: loaded.sheet.isoYear,
      isoWeek: loaded.sheet.isoWeek,
      part: loaded.part,
      partCount: loaded.partCount,
      periodStart: loaded.dates[0],
      periodEnd: loaded.dates.at(-1),
      status: "draft",
      rejectionReason: null,
      version: 0,
      ...totals,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  return NextResponse.json({ ok: true });
}

export async function PUT(request: Request) {
  try {
    return await saveCurrent(request);
  } catch (error) {
    console.error("Saving time report failed", error);
    return NextResponse.json(
      {
        error:
          "The time report could not be saved. Please try again. If the problem continues, contact an administrator.",
      },
      { status: 500 },
    );
  }
}
