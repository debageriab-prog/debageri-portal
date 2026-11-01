"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/durations/duration";
import { appCheckFetch } from "@/lib/firebase/client";
import {
  AttachmentPreviewModal,
  PreviewButton,
  type PreviewTarget,
} from "@/app/finance/FinanceAttachments";
import { ConsultantAvatar } from "@/app/time-reports/ConsultantAvatar";
import { useLocale } from "@/components/localization/LocaleProvider";
import { TimesheetAttachments } from "@/components/timesheets/TimesheetAttachments";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { aggregateReportedDays } from "@/domain/reports/aggregate";
import {
  consultantIncome,
  type EstimatedIncome,
  type IncomeAgreement,
} from "@/domain/reports/income";
import { isEditable } from "@/domain/timesheets/rules";
import type { TimesheetStatus } from "@/domain/types";
import { getIsoWeekDates } from "@/lib/dates/iso-week";
import {
  dateRangeLabel,
  timesheetErrorMessage,
  timesheetStatusLabel,
} from "@/lib/localization/timesheets";

type HistorySheet = {
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
  rejectionReason?: string | null;
};
type HistoryAttachment = {
  id: string;
  timesheetId: string;
  name: string;
  contentType: string;
};
type HistoryEntry = {
  timesheetId: string;
  date: string;
  minutes: number;
  name: string;
  countsAsWorkedTime: boolean;
  hourlyRate?: number;
};

function monthBounds(month: string): [string, string] {
  const [monthYear, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(
    Date.UTC(monthYear!, monthNumber!, 0),
  ).getUTCDate();
  return [`${month}-01`, `${month}-${String(daysInMonth).padStart(2, "0")}`];
}

function workingDates(
  start: string,
  end: string,
  holidayDates: string[],
  reportingStartDate: string | null,
  employmentEndDate: string | null,
) {
  const dates: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last) {
    const date = cursor.toISOString().slice(0, 10);
    const weekday = cursor.getUTCDay();
    if (
      weekday >= 1 &&
      weekday <= 5 &&
      !holidayDates.includes(date) &&
      (!reportingStartDate || date >= reportingStartDate) &&
      (!employmentEndDate || date <= employmentEndDate)
    )
      dates.push(date);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function periodTotals(
  periodEntries: HistoryEntry[],
  start: string,
  end: string,
  holidayDates: string[],
  reportingStartDate: string | null,
  employmentEndDate: string | null,
) {
  const byCode = new Map<string, number>();
  let worked = 0;
  for (const entry of periodEntries) {
    if (entry.countsAsWorkedTime) worked += entry.minutes;
    else byCode.set(entry.name, (byCode.get(entry.name) ?? 0) + entry.minutes);
  }
  const expected =
    workingDates(
      start,
      end,
      holidayDates,
      reportingStartDate,
      employmentEndDate,
    ).length * 480;
  const reported = periodEntries.reduce((sum, entry) => sum + entry.minutes, 0);
  return {
    worked,
    unreported: Math.max(0, expected - reported),
    byCode,
    expected,
    total: Math.max(expected, reported, 1),
  };
}

export function HistoryView({
  sheets,
  entries,
  attachments,
  currentYear,
  currentWeek,
  currentMonth,
  reportingStartDate,
  employmentEndDate,
  holidayDates,
  readOnly = false,
  title,
  description,
  initialMode = "latest",
  avatarUserId,
  showEstimatedIncome = false,
  incomeAgreements,
  hourlyRate = 0,
}: {
  sheets: HistorySheet[];
  entries: HistoryEntry[];
  /** Set for a reporter's own view; adds the files column. */
  attachments?: HistoryAttachment[];
  currentYear: number;
  currentWeek: number;
  currentMonth: string;
  reportingStartDate: string | null;
  employmentEndDate: string | null;
  holidayDates: string[];
  readOnly?: boolean;
  title?: string;
  description?: string;
  initialMode?: "latest" | "year" | "month" | "week";
  avatarUserId?: string;
  showEstimatedIncome?: boolean;
  /** Set for a consultant's own view; limits income to these agreements. */
  incomeAgreements?: IncomeAgreement[];
  hourlyRate?: number;
}) {
  const { t } = useLocale();
  const displayTitle = title ?? t("history");
  const displayDescription = description ?? t("historyDescription");
  const router = useRouter();
  const [mode, setMode] = useState<"latest" | "year" | "month" | "week">(
    initialMode,
  );
  const [page, setPage] = useState(1);
  const [year, setYear] = useState(currentYear);
  const [week, setWeek] = useState(currentWeek);
  const [month, setMonth] = useState(currentMonth);
  const [deleting, setDeleting] = useState<HistorySheet | null>(null);
  const [error, setError] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [viewing, setViewing] = useState<HistorySheet | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previewing, setPreviewing] = useState<PreviewTarget | null>(null);

  const weeklySheets = sheets.filter(
    (sheet) => sheet.isoYear === year && sheet.isoWeek === week,
  );
  const latestSheets = sheets.slice((page - 1) * 10, page * 10);
  const monthEntries = entries.filter((entry) => entry.date.startsWith(month));
  const monthSheets = sheets.filter((sheet) =>
    sheet.periodStart.startsWith(month),
  );
  const yearEntries = entries.filter((entry) =>
    entry.date.startsWith(`${year}-`),
  );
  const yearSheets = sheets.filter((sheet) =>
    sheet.periodStart.startsWith(`${year}-`),
  );
  const monthTotals = useMemo(() => {
    const [start, end] = monthBounds(month);
    return periodTotals(
      monthEntries,
      start,
      end,
      holidayDates,
      reportingStartDate,
      employmentEndDate,
    );
  }, [
    employmentEndDate,
    holidayDates,
    month,
    monthEntries,
    reportingStartDate,
  ]);
  const yearTotals = useMemo(
    () =>
      periodTotals(
        yearEntries,
        `${year}-01-01`,
        `${year}-12-31`,
        holidayDates,
        reportingStartDate,
        employmentEndDate,
      ),
    [employmentEndDate, holidayDates, reportingStartDate, year, yearEntries],
  );
  const weeklyEntries = entries.filter((entry) =>
    weeklySheets.some((sheet) => sheet.id === entry.timesheetId),
  );
  const chartTotals =
    mode === "week"
      ? {
          worked: weeklyEntries
            .filter((entry) => entry.countsAsWorkedTime)
            .reduce((sum, entry) => sum + entry.minutes, 0),
          unreported: Math.max(
            0,
            weeklySheets.reduce(
              (sum, sheet) => sum + sheet.expectedMinutes,
              0,
            ) - weeklyEntries.reduce((sum, entry) => sum + entry.minutes, 0),
          ),
          byCode: weeklyEntries
            .filter((entry) => !entry.countsAsWorkedTime)
            .reduce((totals, entry) => {
              totals.set(
                entry.name,
                (totals.get(entry.name) ?? 0) + entry.minutes,
              );
              return totals;
            }, new Map<string, number>()),
          expected: weeklySheets.reduce(
            (sum, sheet) => sum + sheet.expectedMinutes,
            0,
          ),
          total: Math.max(
            weeklySheets.reduce((sum, sheet) => sum + sheet.expectedMinutes, 0),
            weeklyEntries.reduce((sum, entry) => sum + entry.minutes, 0),
            1,
          ),
        }
      : mode === "year"
        ? yearTotals
        : monthTotals;

  const hourSegments = [
    { label: t("worked"), value: chartTotals.worked, color: "#35634a" },
    ...[...chartTotals.byCode].map(([label, value], index) => ({
      label,
      value,
      color: ["#a56f4e", "#b88b5d", "#8a7186", "#668a91"][index % 4]!,
    })),
    {
      label: t("notReported"),
      value: chartTotals.unreported,
      color: "#ddd3ca",
    },
  ].filter((segment) => segment.value > 0);
  const selectedEntries =
    mode === "year"
      ? yearEntries
      : mode === "month"
        ? monthEntries
        : weeklyEntries;
  const reportedForSelection = selectedEntries.reduce(
    (sum, entry) => sum + entry.minutes,
    0,
  );
  const dayTotals = aggregateReportedDays(
    selectedEntries,
    chartTotals.expected,
  );
  const daySegments = [
    { label: t("worked"), value: dayTotals.worked, color: "#35634a" },
    ...[...dayTotals.byCode].map(([label, value], index) => ({
      label,
      value,
      color: ["#a56f4e", "#b88b5d", "#8a7186", "#668a91"][index % 4]!,
    })),
    {
      label: t("notReported"),
      value: dayTotals.unreported,
      color: "#ddd3ca",
    },
  ].filter((segment) => segment.value > 0);
  const formatDays = (minutes: number) => {
    const days = minutes / 480;
    return `${Number.isInteger(days) ? days : days.toFixed(1)} ${days === 1 ? t("day") : t("days")}`;
  };
  const formatIncome = (amount: number) =>
    `${new Intl.NumberFormat("en-SE", { maximumFractionDigits: 0 }).format(amount)} SEK`;

  function summaryChart(unit: "hours" | "days") {
    const segments = unit === "hours" ? hourSegments : daySegments;
    const total = unit === "hours" ? chartTotals.total : dayTotals.total;
    let cursor = 0;
    const gradient = segments
      .map((segment) => {
        const start = (cursor / total) * 360;
        cursor += segment.value;
        const end = (cursor / total) * 360;
        return `${segment.color} ${start}deg ${end}deg`;
      })
      .join(", ");
    return (
      <div className="summary-chart">
        <div
          className="donut"
          style={{
            background: gradient ? `conic-gradient(${gradient})` : "#eee",
          }}
        >
          <div>
            <strong>
              {unit === "hours"
                ? formatDuration(reportedForSelection)
                : formatDays(dayTotals.reported)}
            </strong>
            <span>
              {t("reported")} {unit === "hours" ? t("hours") : t("days")}
            </span>
          </div>
        </div>
        <div className="chart-legend">
          {segments.map((segment) => (
            <div key={segment.label}>
              <i style={{ background: segment.color }} />
              <span>
                {segment.label}{" "}
                <strong>
                  {unit === "hours"
                    ? formatDuration(segment.value)
                    : formatDays(segment.value)}
                </strong>
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function selectedWorkingDates() {
    if (mode === "week" && !(Number.isInteger(week) && week >= 1 && week <= 53))
      return [];
    const weekDates = mode === "week" ? getIsoWeekDates(year, week) : [];
    const [start, end] =
      mode === "year"
        ? [`${year}-01-01`, `${year}-12-31`]
        : mode === "week"
          ? [weekDates[0]!, weekDates[6]!]
          : monthBounds(month);
    return workingDates(
      start,
      end,
      holidayDates,
      reportingStartDate,
      employmentEndDate,
    );
  }

  function estimatedIncome(): EstimatedIncome | null {
    if (!showEstimatedIncome || mode === "latest") return null;
    if (incomeAgreements)
      return consultantIncome(
        selectedEntries,
        selectedWorkingDates(),
        hourlyRate,
        incomeAgreements,
      );
    const worked = selectedEntries
      .filter((entry) => entry.countsAsWorkedTime)
      .reduce(
        (sum, entry) =>
          sum + (entry.minutes / 60) * (entry.hourlyRate ?? hourlyRate),
        0,
      );
    const possibleIncome = (chartTotals.expected / 60) * hourlyRate;
    return {
      worked,
      notReached: Math.max(0, possibleIncome - worked),
      label: "estimatedIncome",
    };
  }

  const income = estimatedIncome();

  function incomeChart({
    worked: workedIncome,
    notReached,
    label,
  }: EstimatedIncome) {
    const totalIncome = Math.max(workedIncome + notReached, 1);
    const reachedDegrees = (workedIncome / totalIncome) * 360;
    const incomeSegments = [
      { label: t(label), value: workedIncome, color: "#3b6f9c" },
      { label: t("notReached"), value: notReached, color: "#f3dadd" },
    ];

    return (
      <div className="summary-chart">
        <div
          className="donut"
          style={{
            background: `conic-gradient(#3b6f9c 0deg ${reachedDegrees}deg, #f3dadd ${reachedDegrees}deg 360deg)`,
          }}
        >
          <div>
            <strong>{formatIncome(workedIncome)}</strong>
            <span>{t(label).toLowerCase()}</span>
          </div>
        </div>
        <div className="chart-legend">
          {incomeSegments.map((segment) => (
            <div key={segment.label}>
              <i style={{ background: segment.color }} />
              <span>
                {segment.label} <strong>{formatIncome(segment.value)}</strong>
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function reportBreakdown(timesheetId: string) {
    const totals = new Map<string, number>();
    for (const entry of entries.filter(
      (item) => item.timesheetId === timesheetId,
    )) {
      const label = entry.countsAsWorkedTime ? t("worked") : entry.name;
      totals.set(label, (totals.get(label) ?? 0) + entry.minutes);
    }
    if (!totals.size) totals.set(t("worked"), 0);
    return [...totals].sort(([left], [right]) =>
      left === t("worked")
        ? -1
        : right === t("worked")
          ? 1
          : left.localeCompare(right),
    );
  }

  async function remove() {
    if (!deleting) return;
    const response = await appCheckFetch(
      `/api/timesheets/${encodeURIComponent(deleting.id)}`,
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      return setError(
        timesheetErrorMessage(t, result.error, "timesheetDeleteFailed"),
      );
    setDeleting(null);
    router.refresh();
  }

  function closeDetails() {
    setViewing(null);
    setPendingFiles([]);
  }

  function sheetFiles(sheet: HistorySheet) {
    const files = (attachments ?? []).filter(
      (attachment) => attachment.timesheetId === sheet.id,
    );
    if (!files.length) return "-";
    return (
      <ul className="table-attachment-list">
        {files.map((file) => (
          <li key={file.id}>
            <span className="stored-attachment">
              <span className="stored-attachment-name">{file.name}</span>
              <PreviewButton
                name={file.name}
                onClick={() =>
                  setPreviewing({
                    name: file.name,
                    contentType: file.contentType,
                    fileUrl: `/api/timesheets/${encodeURIComponent(sheet.id)}/attachments/${encodeURIComponent(file.id)}`,
                  })
                }
              />
            </span>
          </li>
        ))}
      </ul>
    );
  }

  function table(selected: HistorySheet[]) {
    return selected.length ? (
      <table>
        <thead>
          <tr>
            <th>{t("week")}</th>
            <th>{t("period")}</th>
            <th>{t("reported")}</th>
            <th>{t("status")}</th>
            {attachments && <th>{t("attachments")}</th>}
            <th>
              <span className="sr-only">{t("actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {selected.map((sheet) => (
            <tr key={sheet.id}>
              <td>
                {sheet.isoYear}-W{String(sheet.isoWeek).padStart(2, "0")}
                {sheet.partCount > 1
                  ? `-${String(sheet.part).padStart(2, "0")}`
                  : ""}
              </td>
              <td>{dateRangeLabel(t, sheet.periodStart, sheet.periodEnd)}</td>
              <td>
                <div className="report-breakdown">
                  {reportBreakdown(sheet.id).map(([label, minutes]) => (
                    <span key={label}>
                      <strong>{formatDuration(minutes)}</strong> {label}
                    </span>
                  ))}
                </div>
              </td>
              <td>
                <span className={`status status-${sheet.status}`}>
                  {timesheetStatusLabel(t, sheet.status)}
                </span>
              </td>
              {attachments && <td>{sheetFiles(sheet)}</td>}
              <td>
                {readOnly ? (
                  <button
                    className="table-action"
                    onClick={() => setViewing(sheet)}
                  >
                    {t("view")}
                  </button>
                ) : (
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={t("viewDetails")}
                      title={t("viewDetails")}
                      onClick={() => setViewing(sheet)}
                    >
                      i
                    </button>
                    {isEditable(sheet.status as TimesheetStatus) && (
                      <Link
                        className="table-action icon-action"
                        aria-label={t("edit")}
                        title={t("edit")}
                        href={`/employee/timesheets/current?year=${sheet.isoYear}&week=${sheet.isoWeek}&part=${sheet.part}`}
                      >
                        <ActionIcon type="edit" />
                      </Link>
                    )}
                    {["draft", "submitted"].includes(sheet.status) && (
                      <button
                        className="table-action table-action-danger icon-action"
                        aria-label={t("delete")}
                        title={t("delete")}
                        onClick={() => {
                          setError("");
                          setDeleteConfirmation("");
                          setDeleting(sheet);
                        }}
                      >
                        <ActionIcon type="delete" />
                      </button>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <p>{t("noTimesheets")}</p>
    );
  }

  return (
    <>
      <div className="topbar">
        <div className={avatarUserId ? "report-title-with-avatar" : undefined}>
          {avatarUserId && (
            <ConsultantAvatar
              userId={avatarUserId}
              displayName={displayTitle}
            />
          )}
          <div>
            <div className="eyebrow">{t("timeReporting")}</div>
            <h1>{displayTitle}</h1>
            <p className="muted page-description">{displayDescription}</p>
          </div>
        </div>
      </div>
      <section className="card history-controls">
        <div className="week-mode-picker history-mode-picker">
          <button
            className={mode === "latest" ? "selected" : ""}
            onClick={() => setMode("latest")}
          >
            {t("latest")}
          </button>
          <button
            className={mode === "year" ? "selected" : ""}
            onClick={() => setMode("year")}
          >
            {t("year")}
          </button>
          <button
            className={mode === "month" ? "selected" : ""}
            onClick={() => setMode("month")}
          >
            {t("month")}
          </button>
          <button
            className={mode === "week" ? "selected" : ""}
            onClick={() => setMode("week")}
          >
            {t("week")}
          </button>
        </div>
        {mode === "year" ? (
          <label>
            {t("year")}
            <input
              className="field compact-field"
              type="number"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            />
          </label>
        ) : mode === "week" ? (
          <div className="actions">
            <label>
              {t("year")}
              <input
                className="field compact-field"
                type="number"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
              />
            </label>
            <label>
              {t("week")}
              <input
                className="field compact-field"
                type="number"
                min="1"
                max="53"
                value={week}
                onChange={(event) => setWeek(Number(event.target.value))}
              />
            </label>
          </div>
        ) : mode === "month" ? (
          <label>
            {t("month")}
            <input
              className="field"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
        ) : null}
      </section>
      {mode !== "latest" && (
        <section
          className={`card month-summary year-summary${income ? " income-summary" : ""}`}
        >
          {summaryChart("hours")}
          {summaryChart("days")}
          {income && incomeChart(income)}
        </section>
      )}
      <section className="card table-wrap">
        {table(
          mode === "latest"
            ? latestSheets
            : mode === "year"
              ? yearSheets
              : mode === "week"
                ? weeklySheets
                : monthSheets,
        )}
        {mode === "latest" && sheets.length > 10 && (
          <div className="pagination">
            <button
              className="button secondary"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              {t("previous")}
            </button>
            <span>
              {t("page")} {page} {t("of")} {Math.ceil(sheets.length / 10)}
            </span>
            <button
              className="button secondary"
              disabled={page * 10 >= sheets.length}
              onClick={() => setPage((value) => value + 1)}
            >
              {t("next")}
            </button>
          </div>
        )}
      </section>
      {deleting && (
        <div className="modal-backdrop">
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow danger-text">
                  {t("deleteTimeReport")}
                </span>
                <h2>
                  {t("delete")} {t("week").toLowerCase()} {deleting.isoWeek}?
                </h2>
                <p>
                  {t("deleteReportDescription").replace(
                    "{status}",
                    timesheetStatusLabel(t, deleting.status).toLowerCase(),
                  )}
                </p>
              </div>
            </header>
            {error && <p className="notice notice-error">{error}</p>}
            <label>
              {t("typeToConfirm").split("{phrase}")[0]}
              <strong>{t("attachmentDeleteConfirmationPhrase")}</strong>
              {t("typeToConfirm").split("{phrase}")[1]}
              <input
                className="field"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                autoFocus
              />
            </label>
            <footer className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setDeleting(null)}
              >
                {t("keepReport")}
              </button>
              <button
                className="button danger"
                disabled={deleteConfirmation !== "I am sure"}
                onClick={() => void remove()}
              >
                {t("deleteReport")}
              </button>
            </footer>
          </section>
        </div>
      )}
      {viewing && (
        <div className="modal-backdrop" onMouseDown={closeDetails}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={t("timeReportForWeek").replace(
              "{week}",
              String(viewing.isoWeek),
            )}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow">{t("timeReportDetails")}</span>
                <h2>
                  {t("week")} {viewing.isoWeek}
                  {viewing.partCount > 1
                    ? `-${String(viewing.part).padStart(2, "0")}`
                    : ""}
                </h2>
                <p>
                  {dateRangeLabel(t, viewing.periodStart, viewing.periodEnd)}
                </p>
                <span className={`status status-${viewing.status}`}>
                  {timesheetStatusLabel(t, viewing.status)}
                </span>
              </div>
              <button
                className="modal-close"
                aria-label={t("closeTimeReportDetails")}
                onClick={closeDetails}
              >
                ×
              </button>
            </header>
            {viewing.status === "rejected" && viewing.rejectionReason && (
              <p className="notice notice-warning">
                <strong>{t("rejectionReason")}:</strong>{" "}
                {viewing.rejectionReason}
              </p>
            )}
            <div className="table-wrap">
              <table className="report-details-table">
                <thead>
                  <tr>
                    <th>{t("date")}</th>
                    <th>{t("code")}</th>
                    <th>{t("time")}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries
                    .filter((entry) => entry.timesheetId === viewing.id)
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((entry, index) => (
                      <tr key={`${entry.date}-${entry.name}-${index}`}>
                        <td>{entry.date}</td>
                        <td>
                          {entry.countsAsWorkedTime ? t("worked") : entry.name}
                        </td>
                        <td>{formatDuration(entry.minutes)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {readOnly ? (
              <TimesheetAttachments timesheetId={viewing.id} />
            ) : (
              <TimesheetAttachments
                timesheetId={viewing.id}
                files={pendingFiles}
                onFilesChange={setPendingFiles}
                onStoredChange={() => router.refresh()}
              />
            )}
            <footer className="modal-actions">
              <button className="button secondary" onClick={closeDetails}>
                {t("close")}
              </button>
            </footer>
          </section>
        </div>
      )}
      {previewing && (
        <AttachmentPreviewModal
          target={previewing}
          onClose={() => setPreviewing(null)}
        />
      )}
    </>
  );
}
