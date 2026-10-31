"use client";

import { useLocale } from "@/components/localization/LocaleProvider";
import {
  TimesheetAttachments,
  timesheetAttachmentMessage,
  uploadTimesheetAttachments,
} from "@/components/timesheets/TimesheetAttachments";
import { DateInput } from "@/components/ui/DateInput";
import { ActionIcon } from "@/components/ui/ActionIcon";
import {
  hasSameEntries,
  isAfterEmployment,
  isEditable,
} from "@/domain/timesheets/rules";
import type { TimesheetStatus } from "@/domain/types";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/durations/duration";
import { appCheckFetch } from "@/lib/firebase/client";
import { timesheetErrorMessage } from "@/lib/localization/timesheets";
import {
  getIsoWeek,
  getIsoWeekDates,
  splitWeekByMonth,
} from "@/lib/dates/iso-week";

type Code = {
  id: string;
  code: string;
  category: string;
  countsAsWorkedTime: boolean;
};
type StoredEntry = {
  id: string;
  date: string;
  timeCodeId: string;
  minutes: number;
};
type Row = { key: string; timeCodeId: string; minutes: number[] };
type Data = {
  id: string;
  dates: string[];
  redDays: Array<{ date: string; isRed: boolean; reason: string | null }>;
  sheet: {
    isoYear: number;
    isoWeek: number;
    status: TimesheetStatus;
    expectedMinutes: number;
    rejectionReason?: string | null;
  };
  employmentEndDate: string | null;
  codes: Code[];
  entries: StoredEntry[];
  copyEntries: StoredEntry[];
  part: number;
  partCount: number;
  rejectedReports: Array<{
    id: string;
    isoYear: number;
    isoWeek: number;
    part: number;
    partCount: number;
    reason: string;
  }>;
  latestReported: {
    isoYear: number;
    isoWeek: number;
    periodStart: string;
    periodEnd: string;
  } | null;
};

function entriesToRows(data: Data, entries: StoredEntry[]): Row[] {
  const rows = new Map<string, Row>();
  for (const entry of entries) {
    const row = rows.get(entry.timeCodeId) ?? {
      key: entry.timeCodeId,
      timeCodeId: entry.timeCodeId,
      minutes: Array(data.dates.length).fill(0) as number[],
    };
    const day = data.dates.indexOf(entry.date);
    if (day >= 0) row.minutes[day] = (row.minutes[day] ?? 0) + entry.minutes;
    rows.set(entry.timeCodeId, row);
  }
  const workCode = data.codes.find((code) => code.category === "work");
  if (workCode && !rows.has(workCode.id))
    rows.set(workCode.id, {
      key: workCode.id,
      timeCodeId: workCode.id,
      minutes: Array(data.dates.length).fill(0) as number[],
    });
  return [...rows.values()].sort(
    (a, b) =>
      data.codes.findIndex((code) => code.id === a.timeCodeId) -
      data.codes.findIndex((code) => code.id === b.timeCodeId),
  );
}

function rowsToEntries(data: Data, rows: Row[]) {
  return rows.flatMap((row) =>
    row.minutes.flatMap((minutes, day) =>
      minutes > 0
        ? [
            {
              date: data.dates[day]!,
              timeCodeId: row.timeCodeId,
              minutes,
              comment: null,
            },
          ]
        : [],
    ),
  );
}

export function WeeklyTimesheet() {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState(t("loading"));
  const [yearInput, setYearInput] = useState(new Date().getUTCFullYear());
  const [weekInput, setWeekInput] = useState(1);
  const [copyPanelOpen, setCopyPanelOpen] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [copyYear, setCopyYear] = useState(new Date().getUTCFullYear());
  const [copyWeek, setCopyWeek] = useState(1);
  const [weekMode, setWeekMode] = useState<"current" | "number" | "date">(
    "current",
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [success, setSuccess] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [nonWorkingOpen, setNonWorkingOpen] = useState(false);
  const [autoApproving, setAutoApproving] = useState(false);
  const [workedAllDays, setWorkedAllDays] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachmentsVersion, setAttachmentsVersion] = useState(0);
  const periodClosed =
    data !== null && isAfterEmployment(data.dates[0]!, data.employmentEndDate);
  const editable = data && isEditable(data.sheet.status) && !periodClosed;
  const hasWorkCode = data?.codes.some((code) => code.category === "work");
  const otherRejected =
    data?.rejectedReports.filter((report) => report.id !== data.id) ?? [];
  const periodLabel = data
    ? `${t("week")} ${data.sheet.isoWeek}${
        data.partCount > 1 ? `-${String(data.part).padStart(2, "0")}` : ""
      }`
    : "";

  async function loadWeek(
    year?: number,
    week?: number,
    copy?: { year: number; week: number },
    part?: number,
  ) {
    setMessage(t("loading"));
    setCopyError("");
    const query = new URLSearchParams();
    if (year && week) {
      query.set("year", String(year));
      query.set("week", String(week));
    }
    if (copy) {
      query.set("copyYear", String(copy.year));
      query.set("copyWeek", String(copy.week));
    }
    if (part) query.set("part", String(part));
    try {
      const response = await appCheckFetch(`/api/timesheets/current?${query}`);
      if (response.status === 401) return router.replace("/auth/login");
      const result = await response.json();
      if (!response.ok) {
        const feedback = timesheetErrorMessage(
          t,
          result.error,
          "timesheetLoadFailed",
        );
        setMessage(copy ? "" : feedback);
        setCopyError(copy ? feedback : "");
        return;
      }
      const loaded = result.data as Data;
      if (copy && !loaded.copyEntries.length) {
        setMessage("");
        setCopyError(t("copyWeekEmpty").replace("{week}", String(copy.week)));
        return;
      }
      setData(loaded);
      setYearInput(loaded.sheet.isoYear);
      setWeekInput(loaded.sheet.isoWeek);
      setRows(
        entriesToRows(loaded, copy ? loaded.copyEntries : loaded.entries),
      );
      setWorkedAllDays(false);
      if (!copy) setPendingFiles([]);
      setNonWorkingOpen(
        loaded.sheet.status === "draft" &&
          loaded.sheet.expectedMinutes === 0 &&
          !isAfterEmployment(loaded.dates[0]!, loaded.employmentEndDate) &&
          !copy,
      );
      setMessage(copy ? t("copiedEntriesReady") : "");
    } catch {
      setMessage(t("timesheetLoadFailed"));
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectedYear = Number(params.get("year"));
    const selectedWeek = Number(params.get("week"));
    const selectedPart = Number(params.get("part"));
    const timeout = window.setTimeout(() => {
      if (selectedYear && selectedWeek) {
        setWeekMode("number");
        void loadWeek(
          selectedYear,
          selectedWeek,
          undefined,
          selectedPart || undefined,
        );
      } else void loadWeek();
    }, 0);
    return () => window.clearTimeout(timeout);
    // Initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reported = useMemo(
    () =>
      rows.reduce(
        (total, row) =>
          total + row.minutes.reduce((sum, minutes) => sum + minutes, 0),
        0,
      ),
    [rows],
  );

  function toggleWorkedAllDays(checked: boolean) {
    if (!data) return;
    const workCode = data.codes.find((code) => code.category === "work");
    if (!workCode) return;
    setCopyError("");
    setWorkedAllDays(checked);
    setRows((current) => {
      const existing = current.find((row) => row.timeCodeId === workCode.id);
      const workRow = existing ?? {
        key: workCode.id,
        timeCodeId: workCode.id,
        minutes: Array(data.dates.length).fill(0) as number[],
      };
      const updated = {
        ...workRow,
        minutes: data.dates.map((date, day) => {
          const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
          return checked &&
            weekday >= 1 &&
            weekday <= 5 &&
            !data.redDays[day]?.isRed &&
            !isAfterEmployment(date, data.employmentEndDate)
            ? 480
            : 0;
        }),
      };
      return existing
        ? current.map((row) => (row.key === existing.key ? updated : row))
        : [updated, ...current];
    });
  }
  const reportedRedDays =
    data?.redDays.filter(
      (redDay, day) =>
        redDay.isRed && rows.some((row) => (row.minutes[day] ?? 0) > 0),
    ) ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const futureDates =
    data?.dates.filter(
      (date, day) =>
        date > today && rows.some((row) => (row.minutes[day] ?? 0) > 0),
    ) ?? [];
  const submitWarnings = [
    ...(reportedRedDays.length
      ? [
          reportedRedDays.length === 1
            ? t("warningRedDay")
            : t("warningRedDays").replace(
                "{count}",
                String(reportedRedDays.length),
              ),
        ]
      : []),
    ...(reported > 2400 ? [t("warningOver40Hours")] : []),
    ...(futureDates.length ? [t("warningFutureDates")] : []),
    ...(data?.sheet.status === "rejected" &&
    !pendingFiles.length &&
    hasSameEntries(data.entries, rowsToEntries(data, rows))
      ? [t("warningResubmitUnchanged")]
      : []),
  ];

  function addRow() {
    if (!data?.codes.length) return;
    const unused =
      data.codes.find(
        (code) => !rows.some((row) => row.timeCodeId === code.id),
      ) ?? data.codes[0]!;
    setRows((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        timeCodeId: unused.id,
        minutes: Array(data.dates.length).fill(0) as number[],
      },
    ]);
  }

  function changeMinutes(row: Row, day: number, hours: number) {
    if (!data) return;
    const minutes = Math.round(hours * 60);
    const next = [...row.minutes];
    next[day] = minutes;
    setRows((current) =>
      current.map((item) =>
        item.key === row.key ? { ...item, minutes: next } : item,
      ),
    );
  }

  function changeTimeCode(row: Row, timeCodeId: string) {
    if (!data) return;
    const code = data.codes.find((item) => item.id === timeCodeId);
    const minutes =
      code?.countsAsWorkedTime === true
        ? row.minutes
        : row.minutes.map((value, day) =>
            data.redDays[day]?.isRed ? 0 : value,
          );
    setRows((current) =>
      current.map((item) =>
        item.key === row.key ? { ...item, timeCodeId, minutes } : item,
      ),
    );
  }

  const dateLocale = locale === "sv-SE" ? "sv-SE" : "en-GB";

  function formatDayName(date: string) {
    return new Intl.DateTimeFormat(dateLocale, {
      timeZone: "UTC",
      weekday: "short",
    }).format(new Date(`${date}T12:00:00Z`));
  }

  function formatReportingDay(date: string) {
    return new Intl.DateTimeFormat(dateLocale, {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
    })
      .format(new Date(`${date}T12:00:00Z`))
      .replace(",", "");
  }

  async function save() {
    if (!data) return false;
    setMessage(t("timesheetSaving"));
    try {
      const entries = rowsToEntries(data, rows);
      const query = new URLSearchParams({
        year: String(data.sheet.isoYear),
        week: String(data.sheet.isoWeek),
        part: String(data.part),
      });
      const response = await appCheckFetch(`/api/timesheets/current?${query}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      const result = await response.json().catch(() => ({}));
      const feedback = response.ok
        ? t("saved")
        : timesheetErrorMessage(t, result.error, "timesheetError_saveFailed");
      setMessage(feedback);
      if (!response.ok) setSubmitError(feedback);
      return response.ok;
    } catch {
      const feedback = t("timesheetSaveRetry");
      setMessage(feedback);
      setSubmitError(feedback);
      return false;
    }
  }

  async function uploadPendingFiles(timesheetId: string) {
    const { uploaded, error } = await uploadTimesheetAttachments(
      timesheetId,
      pendingFiles,
    );
    if (uploaded) {
      setPendingFiles((current) => current.slice(uploaded));
      setAttachmentsVersion((version) => version + 1);
    }
    return error ? timesheetAttachmentMessage(t, error) : null;
  }

  async function performSubmit() {
    setSubmitting(true);
    setSubmitError("");
    try {
      if (!(await save()) || !data) return;
      const uploadError = await uploadPendingFiles(data.id);
      if (uploadError) {
        setMessage(uploadError);
        setSubmitError(uploadError);
        return;
      }
      const response = await appCheckFetch(
        `/api/timesheets/${data.id}/submit`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const feedback = timesheetErrorMessage(
          t,
          result.error,
          "timesheetError_alreadyReported",
        );
        setMessage(feedback);
        setSubmitError(feedback);
        return;
      }
      setConfirmOpen(false);
      setConfirmation("");
      setRows([]);
      setSuccess(t("timesheetReported"));
      setWeekMode("number");
      if (data.part < data.partCount) {
        await loadWeek(
          data.sheet.isoYear,
          data.sheet.isoWeek,
          undefined,
          data.part + 1,
        );
      } else {
        const next = new Date(`${data.dates[0]}T12:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 7);
        const selected = getIsoWeek(next);
        await loadWeek(selected.isoYear, selected.isoWeek);
      }
    } catch {
      const feedback = t("timesheetSubmitRetry");
      setMessage(feedback);
      setSubmitError(feedback);
    } finally {
      setSubmitting(false);
    }
  }

  async function approveNonWorkingPeriod() {
    if (!data) return;
    setAutoApproving(true);
    setSubmitError("");
    const query = new URLSearchParams({
      year: String(data.sheet.isoYear),
      week: String(data.sheet.isoWeek),
      part: String(data.part),
    });
    try {
      const response = await appCheckFetch(`/api/timesheets/current?${query}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entries: [],
          autoApproveNonWorking: true,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSubmitError(
          timesheetErrorMessage(t, result.error, "zeroHoursFailed"),
        );
        return;
      }
      const uploadError = await uploadPendingFiles(data.id);
      setNonWorkingOpen(false);
      setSuccess(t("zeroHoursReported"));
      setWeekMode("number");
      if (data.part < data.partCount) {
        await loadWeek(
          data.sheet.isoYear,
          data.sheet.isoWeek,
          undefined,
          data.part + 1,
        );
      } else {
        const next = new Date(`${data.dates[0]}T12:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 7);
        const selected = getIsoWeek(next);
        await loadWeek(selected.isoYear, selected.isoWeek);
      }
      if (uploadError) setMessage(uploadError);
    } catch {
      setSubmitError(t("zeroHoursRetry"));
    } finally {
      setAutoApproving(false);
    }
  }

  function selectCalendarDate(value: string) {
    if (!value) return;
    const selected = getIsoWeek(value);
    setCopyPanelOpen(false);
    void loadWeek(selected.isoYear, selected.isoWeek);
  }

  function previousWeek(firstDate: string) {
    const previous = new Date(`${firstDate}T12:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 7);
    return getIsoWeek(previous);
  }

  function copyPrevious() {
    if (!data) return;
    const selected = previousWeek(data.dates[0]!);
    setCopyPanelOpen(false);
    void loadWeek(data.sheet.isoYear, data.sheet.isoWeek, {
      year: selected.isoYear,
      week: selected.isoWeek,
    });
  }

  function toggleCopyPanel() {
    if (!data) return;
    setCopyError("");
    if (!copyPanelOpen) {
      const selected = previousWeek(data.dates[0]!);
      setCopyYear(selected.isoYear);
      setCopyWeek(selected.isoWeek);
    }
    setCopyPanelOpen(!copyPanelOpen);
  }

  function goToNextWeek() {
    if (!data) return;
    setWeekMode("number");
    setCopyPanelOpen(false);
    setSuccess("");
    if (data.part < data.partCount) {
      void loadWeek(
        data.sheet.isoYear,
        data.sheet.isoWeek,
        undefined,
        data.part + 1,
      );
      return;
    }
    const next = new Date(`${data.dates[0]}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 7);
    const selected = getIsoWeek(next);
    void loadWeek(selected.isoYear, selected.isoWeek);
  }

  function goToPreviousWeek() {
    if (!data) return;
    setWeekMode("number");
    setCopyPanelOpen(false);
    setSuccess("");
    if (data.part > 1) {
      void loadWeek(
        data.sheet.isoYear,
        data.sheet.isoWeek,
        undefined,
        data.part - 1,
      );
      return;
    }
    const selected = previousWeek(data.dates[0]!);
    const previousPartCount = splitWeekByMonth(
      getIsoWeekDates(selected.isoYear, selected.isoWeek),
    ).length;
    void loadWeek(
      selected.isoYear,
      selected.isoWeek,
      undefined,
      previousPartCount,
    );
  }

  if (!data)
    return (
      <section className="card">
        <p>{message}</p>
      </section>
    );

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("timeReporting")}</div>
          <h1>{t("reportTimeTitle")}</h1>
          <p className="muted page-description">{t("reportTimeDescription")}</p>
        </div>
      </div>
      {success && (
        <div className="toast toast-success" role="status">
          <span className="toast-icon">✓</span>
          <span>{success}</span>
          <button
            aria-label={t("dismissMessage")}
            onClick={() => setSuccess("")}
          >
            ×
          </button>
        </div>
      )}
      <section className="card timesheet-controls">
        {data.latestReported && (
          <p className="latest-report-hint">
            <span>{t("latestSubmittedReport")}</span>
            <strong>
              {t("latestSubmittedWeek")
                .replace("{week}", String(data.latestReported.isoWeek))
                .replace(
                  "{start}",
                  data.latestReported.periodStart.replaceAll("-", "/"),
                )
                .replace(
                  "{end}",
                  data.latestReported.periodEnd.replaceAll("-", "/"),
                )}
            </strong>
          </p>
        )}
        <div>
          <label className="reporting-week-selector">
            <strong>{t("reportingWeekLabel")}</strong>
            <select
              className="field"
              value={weekMode}
              aria-label={t("reportingWeekModeLabel")}
              onChange={(event) => {
                const mode = event.target.value as
                  "current" | "number" | "date";
                setWeekMode(mode);
                setCopyPanelOpen(false);
                if (mode === "current") void loadWeek();
              }}
            >
              <option value="current">{t("reportingWeekCurrent")}</option>
              <option value="number">{t("reportingWeekNumber")}</option>
              <option value="date">{t("reportingWeekDate")}</option>
            </select>
          </label>
          {weekMode === "number" && (
            <div className="actions selection-panel">
              <label>
                {t("year")}
                <input
                  className="field compact-field"
                  type="number"
                  value={yearInput}
                  onChange={(event) => setYearInput(Number(event.target.value))}
                />
              </label>
              <label>
                {t("week")}
                <input
                  className="field compact-field"
                  type="number"
                  min="1"
                  max="53"
                  value={weekInput}
                  onChange={(event) => setWeekInput(Number(event.target.value))}
                />
              </label>
              <button
                className="button secondary"
                onClick={() => void loadWeek(yearInput, weekInput)}
              >
                {t("openWeek")}
              </button>
            </div>
          )}
          {weekMode === "date" && (
            <div className="selection-panel">
              <label>
                {t("chooseDateInWeek")}
                <DateInput
                  className="field"
                  onChange={(event) => selectCalendarDate(event.target.value)}
                />
              </label>
              <small className="muted">{t("fullWeekOpensAutomatically")}</small>
            </div>
          )}
        </div>
      </section>
      {(data.sheet.status === "rejected" || otherRejected.length > 0) && (
        <div
          className="notice notice-warning rejected-report-notice"
          role="status"
        >
          {data.sheet.status === "rejected" && (
            <span>
              <strong>
                {t("rejectedWithReason").replace(
                  "{reason}",
                  data.sheet.rejectionReason ?? "",
                )}
              </strong>
              {editable && <small>{t("rejectedReportHint")}</small>}
            </span>
          )}
          {otherRejected.length > 0 && (
            <span className="rejected-report-links">
              {t("otherRejectedReports")}
              {otherRejected.map((report) => (
                <button
                  className="button secondary"
                  type="button"
                  key={report.id}
                  title={report.reason}
                  onClick={() => {
                    setWeekMode("number");
                    setCopyPanelOpen(false);
                    void loadWeek(
                      report.isoYear,
                      report.isoWeek,
                      undefined,
                      report.part,
                    );
                  }}
                >
                  {t("week")} {report.isoWeek}
                  {report.partCount > 1
                    ? `-${String(report.part).padStart(2, "0")}`
                    : ""}
                </button>
              ))}
            </span>
          )}
        </div>
      )}
      {periodClosed && (
        <p className="notice notice-warning">
          {t("reportingClosedAfterEndDate").replace(
            "{date}",
            data.employmentEndDate!,
          )}
        </p>
      )}
      <section className="metrics">
        <div className="metric">
          <span>{t("expected")}</span>
          <strong>{formatDuration(data.sheet.expectedMinutes)}</strong>
        </div>
        <div className="metric">
          <span>{t("reported")}</span>
          <strong>{formatDuration(reported)}</strong>
        </div>
      </section>
      <section className="card table-wrap">
        <div className="timesheet-table-header">
          <div>
            <span className="eyebrow">{t("reportingPeriodLabel")}</span>
            <div className="timesheet-week-nav">
              <button
                className="timesheet-week-arrow"
                type="button"
                aria-label={t("previousWeek")}
                title={t("previousWeek")}
                onClick={goToPreviousWeek}
              >
                <ActionIcon type="previous" />
              </button>
              <strong>
                {t("week")} {data.sheet.isoWeek}
                {data.partCount > 1
                  ? `-${String(data.part).padStart(2, "0")}`
                  : ""}
              </strong>
              <button
                className="timesheet-week-arrow"
                type="button"
                aria-label={t("nextWeek")}
                title={t("nextWeek")}
                onClick={goToNextWeek}
              >
                <ActionIcon type="next" />
              </button>
            </div>
          </div>
          <span>
            {t("periodFromTo")
              .replace("{start}", data.dates[0]!.replaceAll("-", "/"))
              .replace("{end}", data.dates.at(-1)!.replaceAll("-", "/"))}
          </span>
        </div>
        <div
          className="timesheet-quick-actions"
          role="group"
          aria-label={t("fillWeekActions")}
        >
          <button
            className="button secondary"
            type="button"
            aria-pressed={workedAllDays}
            disabled={!editable || !hasWorkCode || !rows.length}
            onClick={() => toggleWorkedAllDays(!workedAllDays)}
          >
            {t("workedAllDays")}
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={!editable}
            onClick={copyPrevious}
          >
            {t("copyLastWeek")}
          </button>
          <button
            className="button secondary"
            type="button"
            aria-expanded={copyPanelOpen}
            disabled={!editable}
            onClick={toggleCopyPanel}
          >
            {t("chooseWeekNumber")}
          </button>
        </div>
        {copyError && (
          <p className="notice notice-error" role="alert">
            {copyError}
          </p>
        )}
        {copyPanelOpen && editable && (
          <div className="actions selection-panel timesheet-copy-panel">
            <label>
              {t("year")}
              <input
                className="field compact-field"
                type="number"
                value={copyYear}
                onChange={(event) => setCopyYear(Number(event.target.value))}
              />
            </label>
            <label>
              {t("week")}
              <input
                className="field compact-field"
                type="number"
                min="1"
                max="53"
                value={copyWeek}
                onChange={(event) => setCopyWeek(Number(event.target.value))}
              />
            </label>
            <button
              className="button secondary"
              type="button"
              onClick={() =>
                void loadWeek(data.sheet.isoYear, data.sheet.isoWeek, {
                  year: copyYear,
                  week: copyWeek,
                })
              }
            >
              {t("copyAction")}
            </button>
          </div>
        )}
        <table className="timesheet-grid">
          <thead>
            <tr>
              <th>{t("code")}</th>
              {data.dates.map((date, day) => (
                <th
                  key={date}
                  className={data.redDays[day]?.isRed ? "red-day" : ""}
                >
                  {formatDayName(date)}
                  <small>{date.slice(8, 10)}</small>
                </th>
              ))}
              <th>{t("total")}</th>
              <th>
                <span className="sr-only">{t("remove")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>
                  <select
                    className="field"
                    value={row.timeCodeId}
                    disabled={!editable}
                    onChange={(event) =>
                      changeTimeCode(row, event.target.value)
                    }
                  >
                    {data.codes.map((code) => (
                      <option key={code.id} value={code.id}>
                        {code.code}
                      </option>
                    ))}
                  </select>
                </td>
                {row.minutes.map((minutes, day) => (
                  <td
                    key={data.dates[day]}
                    className={
                      data.redDays[day]?.isRed ? "red-day red-day-cell" : ""
                    }
                  >
                    <input
                      className="field time-cell"
                      type="number"
                      min="0"
                      max="24"
                      step=".25"
                      value={minutes ? minutes / 60 : ""}
                      placeholder="0"
                      disabled={
                        !editable ||
                        (!minutes &&
                          isAfterEmployment(
                            data.dates[day]!,
                            data.employmentEndDate,
                          )) ||
                        (data.redDays[day]?.isRed &&
                          data.codes.find((code) => code.id === row.timeCodeId)
                            ?.countsAsWorkedTime !== true)
                      }
                      aria-label={t("hoursOnDate").replace(
                        "{date}",
                        data.dates[day]!,
                      )}
                      onChange={(event) =>
                        changeMinutes(row, day, Number(event.target.value))
                      }
                    />
                  </td>
                ))}
                <td>
                  <strong>
                    {formatDuration(
                      row.minutes.reduce((sum, value) => sum + value, 0),
                    )}
                  </strong>
                </td>
                <td>
                  <button
                    className="icon-button"
                    disabled={!editable}
                    aria-label={t("removeRow")}
                    onClick={() => {
                      setWorkedAllDays(false);
                      setRows((current) =>
                        current.filter((item) => item.key !== row.key),
                      );
                    }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {editable && (
          <div className="actions timesheet-actions">
            <button
              className="button secondary"
              disabled={!data.codes.length}
              onClick={addRow}
            >
              {t("addRow")}
            </button>
          </div>
        )}
        <TimesheetAttachments
          key={data.id}
          timesheetId={data.id}
          files={pendingFiles}
          onFilesChange={setPendingFiles}
          uploadOnSubmit={Boolean(editable)}
          refreshKey={attachmentsVersion}
        />
        {editable && (
          <div className="actions timesheet-actions">
            <span className="actions-spacer" />
            <button
              className="button"
              disabled={
                reported < data.sheet.expectedMinutes || !data.codes.length
              }
              onClick={() => {
                if (reported === 0 && data.sheet.expectedMinutes === 0) {
                  setSubmitError("");
                  setNonWorkingOpen(true);
                } else if (submitWarnings.length) {
                  setConfirmation("");
                  setConfirmOpen(true);
                } else void performSubmit();
              }}
            >
              {t("timesheetSubmit")}
            </button>
          </div>
        )}
        {!editable && (
          <div className="actions timesheet-actions">
            <span className="actions-spacer" />
            <span
              title={periodClosed ? undefined : t("timesheetAlreadySubmitted")}
            >
              <button className="button" disabled>
                {t("timesheetSubmit")}
              </button>
            </span>
          </div>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
      </section>
      {confirmOpen && (
        <div className="modal-backdrop">
          <section
            className="modal modal-small warning-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="submit-warning-title"
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow danger-text">
                  {t("reviewWarnings")}
                </span>
                <h2 id="submit-warning-title">{t("submitReportQuestion")}</h2>
                <p>{t("reviewWarningsDescription")}</p>
              </div>
            </header>
            <ul className="warning-list">
              {submitWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            {submitError && (
              <p className="notice notice-error" role="alert">
                {submitError}
              </p>
            )}
            <label>
              {t("typeToSubmit").split("{phrase}")[0]}
              <strong>{t("attachmentDeleteConfirmationPhrase")}</strong>
              {t("typeToSubmit").split("{phrase}")[1]}
              <input
                className="field"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoFocus
              />
            </label>
            <footer className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setConfirmOpen(false)}
              >
                {t("reviewReport")}
              </button>
              <button
                className="button danger"
                disabled={
                  confirmation !== t("attachmentDeleteConfirmationPhrase") ||
                  submitting
                }
                onClick={() => void performSubmit()}
              >
                {submitting ? t("timesheetSubmitting") : t("submitAnyway")}
              </button>
            </footer>
          </section>
        </div>
      )}
      {nonWorkingOpen && editable && (
        <div className="modal-backdrop">
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="non-working-title"
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow">{t("nonWorkingPeriod")}</span>
                <h2 id="non-working-title">{t("nonWorkingTitle")}</h2>
                <p>{t("nonWorkingDaysIn").replace("{period}", periodLabel)}</p>
                <ul className="reporting-day-list">
                  {data.dates.map((date) => (
                    <li key={date}>{formatReportingDay(date)}</li>
                  ))}
                </ul>
                <p>{t("nonWorkingQuestion")}</p>
              </div>
            </header>
            {submitError && (
              <p className="notice notice-error">{submitError}</p>
            )}
            <footer className="modal-actions">
              <button
                className="button secondary"
                disabled={autoApproving}
                onClick={() => {
                  setSubmitError("");
                  setNonWorkingOpen(false);
                }}
              >
                {t("no")}
              </button>
              <button
                className="button"
                disabled={autoApproving}
                onClick={() => void approveNonWorkingPeriod()}
              >
                {autoApproving ? t("reportingZeroHours") : t("reportZeroHours")}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
