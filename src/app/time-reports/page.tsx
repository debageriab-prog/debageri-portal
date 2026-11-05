import { getAdminServices } from "@/lib/firebase/admin";
import { can } from "@/domain/access/permissions";
import { getIsoWeek } from "@/lib/dates/iso-week";
import { verifySession } from "@/server/auth/session";
import { isMonth } from "@/lib/dates/month";
import { TimeReportsView, type ReportPeriod } from "./TimeReportsView";
import { getTranslator } from "@/lib/localization/server";
import { reportVisibleTo } from "@/domain/reports/time-report-export";

export default async function TimeReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    userId?: string;
    period?: string;
    year?: string;
    month?: string;
  }>;
}) {
  const actor = (await verifySession())!;
  const t = await getTranslator();
  const params = await searchParams;
  const { userId } = params;
  const { db } = getAdminServices();
  const [usersSnapshot, timeCodeSnapshot] = await Promise.all([
    db
      .collection("users")
      .where("organizationId", "==", actor.organizationId)
      .get(),
    db
      .collection("timeCodes")
      .where("organizationId", "==", actor.organizationId)
      .get(),
  ]);
  const workedCodes = timeCodeSnapshot.docs
    .map((doc) => doc.data())
    .filter(
      (code) => code.active !== false && code.countsAsWorkedTime === true,
    );
  const showIncome = can(actor, "time.reports.viewIncome");
  const hourlyRateFor = (userId: string) =>
    Number(
      workedCodes.find((code) => code.assignedUserId === userId)?.hourlyRate ??
        workedCodes.find((code) => !code.assignedUserId)?.hourlyRate ??
        0,
    );
  const incomeRate = (rate: unknown) => (showIncome ? Number(rate) : 0);
  const users = usersSnapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        displayName: String(data.displayName ?? data.email),
        role: String(data.role),
        reportsTime: data.reportsTime === true,
        reportingStartDate: data.reportingStartDate
          ? String(data.reportingStartDate)
          : data.employmentStartDate
            ? String(data.employmentStartDate)
            : null,
        employmentEndDate: data.employmentEndDate
          ? String(data.employmentEndDate)
          : null,
        hourlyRate: incomeRate(hourlyRateFor(doc.id)),
      };
    })
    .filter((user) => reportVisibleTo(actor.role, user))
    .sort((left, right) =>
      String(left.displayName).localeCompare(String(right.displayName)),
    );
  const selected = users.find((user) => user.id === userId);

  let sheets: Array<{
    id: string;
    isoYear: number;
    isoWeek: number;
    part: number;
    partCount: number;
    periodStart: string;
    periodEnd: string;
    reportedMinutes: number;
    expectedMinutes: number;
    status: string;
  }> = [];
  let entries: Array<{
    userId: string;
    timesheetId: string;
    date: string;
    minutes: number;
    name: string;
    countsAsWorkedTime: boolean;
    hourlyRate: number;
  }> = [];
  let holidayDates: string[] = [];

  if (selected) {
    const [sheetSnapshot, entrySnapshot, holidaySnapshot] = await Promise.all([
      db.collection("timesheets").where("userId", "==", selected.id).get(),
      db.collection("timeEntries").where("userId", "==", selected.id).get(),
      db
        .collection("holidays")
        .where("organizationId", "==", actor.organizationId)
        .get(),
    ]);
    const totals = new Map<string, number>();
    entries = entrySnapshot.docs.map((doc) => {
      const data = doc.data();
      const timesheetId = String(data.timesheetId);
      const minutes = Number(data.minutes ?? 0);
      totals.set(timesheetId, (totals.get(timesheetId) ?? 0) + minutes);
      return {
        userId: selected.id,
        timesheetId,
        date: String(data.date),
        minutes,
        name: String(
          data.timeCodeSnapshot?.name ??
            data.timeCodeSnapshot?.code ??
            data.timeCodeId,
        ),
        countsAsWorkedTime: Boolean(data.timeCodeSnapshot?.countsAsWorkedTime),
        hourlyRate: incomeRate(
          data.timeCodeSnapshot?.hourlyRate ?? hourlyRateFor(selected.id),
        ),
      };
    });
    sheets = sheetSnapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          isoYear: Number(data.isoYear),
          isoWeek: Number(data.isoWeek),
          part: Number(data.part ?? 1),
          partCount: Number(data.partCount ?? 1),
          periodStart: String(data.periodStart),
          periodEnd: String(data.periodEnd),
          reportedMinutes: totals.get(doc.id) ?? 0,
          expectedMinutes: Number(data.expectedMinutes ?? 0),
          status: String(data.status),
        };
      })
      .sort(
        (a, b) =>
          b.isoYear - a.isoYear || b.isoWeek - a.isoWeek || b.part - a.part,
      );
    holidayDates = holidaySnapshot.docs.map((doc) => String(doc.data().date));
  } else {
    const [entrySnapshot, holidaySnapshot] = await Promise.all([
      db
        .collection("timeEntries")
        .where("organizationId", "==", actor.organizationId)
        .get(),
      db
        .collection("holidays")
        .where("organizationId", "==", actor.organizationId)
        .get(),
    ]);
    const visibleIds = new Set(users.map((user) => user.id));
    entries = entrySnapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          userId: String(data.userId),
          timesheetId: String(data.timesheetId),
          date: String(data.date),
          minutes: Number(data.minutes ?? 0),
          name: String(
            data.timeCodeSnapshot?.name ??
              data.timeCodeSnapshot?.code ??
              data.timeCodeId,
          ),
          countsAsWorkedTime: Boolean(
            data.timeCodeSnapshot?.countsAsWorkedTime,
          ),
          hourlyRate: incomeRate(
            data.timeCodeSnapshot?.hourlyRate ??
              hourlyRateFor(String(data.userId)),
          ),
        };
      })
      .filter((entry) => visibleIds.has(entry.userId));
    holidayDates = holidaySnapshot.docs.map((doc) => String(doc.data().date));
  }

  const today = new Date().toISOString().slice(0, 10);
  const current = getIsoWeek(today);
  const requestedYear = Number(params.year);
  const initialPeriod: ReportPeriod = {
    mode: params.period === "year" ? "year" : "month",
    year:
      Number.isInteger(requestedYear) &&
      requestedYear >= 2000 &&
      requestedYear <= 2100
        ? requestedYear
        : Number(today.slice(0, 4)),
    month: isMonth(params.month) ? params.month : today.slice(0, 7),
  };
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("timeReports")}</div>
          <h1>{t("employeeTimeReports")}</h1>
          <p className="muted page-description">
            {t("timeReportsDescription")}
          </p>
        </div>
      </div>
      <TimeReportsView
        users={users}
        selectedUserId={selected?.id}
        consultantLabel={
          actor.role === "admin" ? t("consultantOrManager") : t("consultant")
        }
        initialPeriod={initialPeriod}
        exportUserId={
          selected && can(actor, "time.reports.export")
            ? selected.id
            : undefined
        }
        dashboard={
          selected
            ? undefined
            : {
                consultants: users,
                entries,
                holidayDates,
                showEstimatedIncome: showIncome,
              }
        }
        history={
          selected
            ? {
                sheets,
                entries,
                currentYear: current.isoYear,
                currentWeek: current.isoWeek,
                currentMonth: today.slice(0, 7),
                reportingStartDate: selected.reportingStartDate,
                employmentEndDate: selected.employmentEndDate,
                holidayDates,
                readOnly: true,
                avatarUserId: selected.id,
                showEstimatedIncome: showIncome && selected.role !== "employee",
                hourlyRate: selected.hourlyRate,
                title: String(selected.displayName),
                description: t("selectedReportDescription"),
              }
            : undefined
        }
      />
    </>
  );
}
