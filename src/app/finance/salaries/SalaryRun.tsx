"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { DateInput } from "@/components/ui/DateInput";
import { InfoTip } from "@/components/ui/InfoTip";
import { compensationModelLabels } from "@/domain/finance/compensation";
import {
  DEFAULT_EMPLOYER_FEE_BPS,
  employerFeeMinor,
} from "@/domain/salary/totals";
import { payslipFileUrl } from "@/app/documents/payslips/PayslipPreview";
import type { SalaryCandidate } from "@/server/services/salary-service";
import type { SalaryRow, SalaryRunInfo } from "./salary-data";
import { formatKronor, postSalaryAction, shiftMonth } from "./salary-client";

type Translate = ReturnType<typeof useLocale>["t"];
type MessageKey = Parameters<Translate>[0];

export function salaryError(t: Translate, code: string) {
  return code === "serverUnavailable"
    ? t("serverUnavailable")
    : t(`financeError_${code}` as MessageKey);
}

export function SalaryStatus({
  row,
}: {
  row: Pick<SalaryRow, "status" | "problem">;
}) {
  const { t } = useLocale();
  if (row.problem && row.status === "initiated")
    return (
      <span className="salary-status salary-status-problem">
        {t(`salaryProblem_${row.problem}` as MessageKey)}
      </span>
    );
  return (
    <span className={`salary-status salary-status-${row.status}`}>
      {t(`salaryStatus_${row.status}` as MessageKey)}
    </span>
  );
}

function monthName(period: string, locale: string) {
  const [year, month] = period.split("-").map(Number) as [number, number];
  const name = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
    locale,
    { month: "long", year: "numeric", timeZone: "UTC" },
  );
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function SalaryRun({
  period,
  run,
  rows,
  candidates,
  defaults,
  canEdit,
  canBook,
}: {
  period: string;
  run: SalaryRunInfo | null;
  rows: SalaryRow[];
  candidates: SalaryCandidate[];
  defaults: SalaryRunInfo;
  canEdit: boolean;
  canBook: boolean;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [booking, setBooking] = useState(false);
  const [replacing, setReplacing] = useState<string[] | null>(null);
  const [removing, setRemoving] = useState<SalaryRow | null>(null);

  const chosen = rows.filter((row) => selected.includes(row.id));
  const all = rows.length > 0 && selected.length === rows.length;
  const sum = (key: "grossMinor" | "taxMinor" | "netMinor") =>
    rows.reduce((total, row) => total + row.totals[key], 0);
  const shortOfBalance = rows.filter(
    (row) =>
      row.balanceMinor !== null &&
      row.balanceMinor <
        row.totals.grossMinor +
          employerFeeMinor(row.totals.taxableMinor, DEFAULT_EMPLOYER_FEE_BPS),
  );

  async function perform(
    payload: Record<string, unknown>,
    done: string,
  ): Promise<string | null> {
    setBusy(true);
    setError("");
    setMessage("");
    const failure = await postSalaryAction(payload);
    setBusy(false);
    if (failure) return failure;
    setMessage(done);
    setSelected([]);
    router.refresh();
    return null;
  }

  async function bulk(action: "ready" | "initiated" | "payslips") {
    const slipIds = chosen.map((row) => row.id);
    const failure =
      action === "payslips"
        ? await perform(
            { action: "generatePayslips", slipIds, replaceExisting: false },
            t("salaryPayslipsGenerated"),
          )
        : await perform(
            { action: "setSalarySlipStatus", slipIds, status: action },
            t(action === "ready" ? "salaryMarkedReady" : "salaryReopened"),
          );
    if (failure === "payslipExists") setReplacing(slipIds);
    else if (failure) setError(salaryError(t, failure));
  }

  const can = (status: SalaryRow["status"][]) =>
    chosen.length > 0 && chosen.every((row) => status.includes(row.status));

  return (
    <>
      <section className="card salary-run">
        <div className="salary-run-head">
          <div className="salary-month-nav">
            <Link
              className="timesheet-week-arrow"
              href={`/finance/salaries?period=${shiftMonth(period, -1)}`}
              aria-label={t("previousMonth")}
              title={t("previousMonth")}
            >
              <ActionIcon type="previous" />
            </Link>
            <h2>{monthName(period, locale)}</h2>
            <Link
              className="timesheet-week-arrow"
              href={`/finance/salaries?period=${shiftMonth(period, 1)}`}
              aria-label={t("nextMonth")}
              title={t("nextMonth")}
            >
              <ActionIcon type="next" />
            </Link>
          </div>
          <div className="salary-run-meta">
            {run && (
              <span className="muted">
                {t("salaryRunMeta")
                  .replace("{paymentDate}", run.paymentDate)
                  .replace("{eventFrom}", run.eventFrom)
                  .replace("{eventTo}", run.eventTo)}
              </span>
            )}
            {canEdit && (
              <button
                className="button"
                type="button"
                onClick={() => {
                  setError("");
                  setGenerating(true);
                }}
              >
                {rows.length ? t("updateSalaryRows") : t("generateSalaryRows")}
              </button>
            )}
          </div>
        </div>

        {rows.length > 0 && (
          <div className="metrics salary-metrics">
            <div className="metric">
              <span>{t("salaryPeople")}</span>
              <strong>{rows.length}</strong>
            </div>
            <div className="metric">
              <span>{t("salaryGross")}</span>
              <strong>{formatKronor(sum("grossMinor"), locale)}</strong>
            </div>
            <div className="metric">
              <span>{t("salaryTax")}</span>
              <strong>{formatKronor(sum("taxMinor"), locale)}</strong>
            </div>
            <div className="metric">
              <span>{t("salaryNet")}</span>
              <strong>{formatKronor(sum("netMinor"), locale)}</strong>
            </div>
          </div>
        )}

        {!rows.length ? (
          <p className="muted">{t("noSalaryRows")}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label={t("selectAll")}
                      checked={all}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked ? rows.map((row) => row.id) : [],
                        )
                      }
                    />
                  </th>
                  <th>{t("salaryPerson")}</th>
                  <th>{t("compensationModel")}</th>
                  <th className="numeric">{t("salaryGross")}</th>
                  <th className="numeric">{t("salaryTax")}</th>
                  <th className="numeric">{t("salaryNet")}</th>
                  <th>{t("status")}</th>
                  <th>
                    <span className="sr-only">{t("actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={row.name}
                        checked={selected.includes(row.id)}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, row.id]
                              : current.filter((id) => id !== row.id),
                          )
                        }
                      />
                    </td>
                    <td>{row.name}</td>
                    <td>{t(compensationModelLabels[row.model])}</td>
                    <td className="numeric">
                      {formatKronor(row.totals.grossMinor, locale)}
                    </td>
                    <td className="numeric">
                      {formatKronor(row.totals.taxMinor, locale)}
                    </td>
                    <td className="numeric">
                      {formatKronor(row.totals.netMinor, locale)}
                    </td>
                    <td>
                      <SalaryStatus row={row} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link
                          className="table-action icon-action"
                          href={`/finance/salaries/${period}/${encodeURIComponent(row.userId)}/edit`}
                          aria-label={
                            canEdit && row.status === "initiated"
                              ? t("edit")
                              : t("viewDetails")
                          }
                          title={
                            canEdit && row.status === "initiated"
                              ? t("edit")
                              : t("viewDetails")
                          }
                        >
                          {canEdit && row.status === "initiated" ? (
                            <ActionIcon type="edit" />
                          ) : (
                            <ActionIcon type="info" />
                          )}
                        </Link>
                        {row.payslipId && (
                          <a
                            className="table-action icon-action"
                            href={`${payslipFileUrl(row.payslipId)}?disposition=inline`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={t("viewPayslip")}
                            title={t("viewPayslip")}
                          >
                            <ActionIcon type="pdf" />
                          </a>
                        )}
                        {canEdit && row.status === "initiated" && (
                          <button
                            className="table-action table-action-danger icon-action"
                            type="button"
                            aria-label={t("removeSalaryRow")}
                            title={t("removeSalaryRow")}
                            onClick={() => {
                              setError("");
                              setRemoving(row);
                            }}
                          >
                            <ActionIcon type="delete" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {shortOfBalance.map((row) => (
          <p className="notice notice-warning" key={row.id}>
            {t("salaryBalanceShort")
              .replace("{name}", row.name)
              .replace("{balance}", formatKronor(row.balanceMinor ?? 0, locale))
              .replace(
                "{needed}",
                formatKronor(
                  row.totals.grossMinor +
                    employerFeeMinor(
                      row.totals.taxableMinor,
                      DEFAULT_EMPLOYER_FEE_BPS,
                    ),
                  locale,
                ),
              )}
          </p>
        ))}
        {message && <p className="notice notice-success">{message}</p>}
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}

        {rows.length > 0 && (canEdit || canBook) && (
          <footer className="salary-bulk">
            <span className="muted">
              {t("salarySelected").replace("{count}", String(chosen.length))}
            </span>
            <div className="salary-bulk-actions">
              {canEdit && (
                <>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={busy || !can(["initiated"])}
                    onClick={() => void bulk("ready")}
                  >
                    {t("markSalaryReady")}
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={busy || !can(["ready", "payslipGenerated"])}
                    onClick={() => void bulk("initiated")}
                  >
                    {t("reopenSalary")}
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={busy || !can(["ready", "payslipGenerated"])}
                    onClick={() => void bulk("payslips")}
                  >
                    {t("generatePayslips")}
                  </button>
                </>
              )}
              {canBook && (
                <button
                  className="button"
                  type="button"
                  disabled={busy || !can(["payslipGenerated"])}
                  onClick={() => {
                    setError("");
                    setBooking(true);
                  }}
                >
                  {t("bookSalaries")}
                </button>
              )}
            </div>
          </footer>
        )}
      </section>

      {generating && (
        <GenerateDialog
          defaults={run ?? defaults}
          candidates={candidates}
          rows={rows}
          period={period}
          close={() => setGenerating(false)}
          onDone={(text) => {
            setGenerating(false);
            setMessage(text);
            router.refresh();
          }}
        />
      )}
      {removing && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="remove-salary-title"
          >
            <header className="modal-header">
              <div>
                <h2 id="remove-salary-title">
                  {t("removeSalaryRowTitle").replace("{name}", removing.name)}
                </h2>
                <p>{t("removeSalaryRowExplanation")}</p>
              </div>
            </header>
            <footer className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setRemoving(null)}
              >
                {t("cancel")}
              </button>
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={async () => {
                  const failure = await perform(
                    { action: "removeSalarySlip", slipId: removing.id },
                    t("salaryRowRemoved"),
                  );
                  setRemoving(null);
                  if (failure) setError(salaryError(t, failure));
                }}
              >
                {t("removeSalaryRow")}
              </button>
            </footer>
          </section>
        </div>
      )}
      {booking && (
        <BookDialog
          rows={chosen}
          close={() => setBooking(false)}
          onDone={() => {
            setBooking(false);
            setSelected([]);
            setMessage(t("salariesBooked"));
            router.refresh();
          }}
        />
      )}
      {replacing && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="replace-payslip-title"
          >
            <header className="modal-header">
              <div>
                <h2 id="replace-payslip-title">{t("replacePayslipTitle")}</h2>
                <p>{t("replacePayslipExplanation")}</p>
              </div>
            </header>
            <footer className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setReplacing(null)}
              >
                {t("cancel")}
              </button>
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={async () => {
                  const failure = await perform(
                    {
                      action: "generatePayslips",
                      slipIds: replacing,
                      replaceExisting: true,
                    },
                    t("salaryPayslipsGenerated"),
                  );
                  setReplacing(null);
                  if (failure) setError(salaryError(t, failure));
                }}
              >
                {t("replacePayslip")}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}

function GenerateDialog({
  defaults,
  candidates,
  rows,
  period,
  close,
  onDone,
}: {
  defaults: SalaryRunInfo;
  candidates: SalaryCandidate[];
  rows: SalaryRow[];
  period: string;
  close(): void;
  onDone(message: string): void;
}) {
  const { t, locale } = useLocale();
  const [values, setValues] = useState({
    paymentDate: defaults.paymentDate,
    eventFrom: defaults.eventFrom,
    eventTo: defaults.eventTo,
  });
  // Rows past preparation stay whatever is chosen here.
  const locked = new Set(
    rows.filter((row) => row.status !== "initiated").map((row) => row.userId),
  );
  const [chosen, setChosen] = useState<string[]>(() =>
    candidates
      .map((candidate) => candidate.userId)
      .filter(
        (userId) =>
          locked.has(userId) || !defaults.excludedUserIds.includes(userId),
      ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const failure = await postSalaryAction({
      action: "generateSalaryRun",
      period,
      ...values,
      userIds: chosen,
    });
    setBusy(false);
    if (failure) setError(salaryError(t, failure));
    else onDone(t("salaryRowsGenerated"));
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-salary-title"
        onSubmit={submit}
      >
        <header className="modal-header">
          <div>
            <h2 id="generate-salary-title">
              {t("generateSalaryTitle").replace(
                "{month}",
                monthName(period, locale),
              )}
            </h2>
            <p>{t("generateSalaryExplanation")}</p>
          </div>
          <button
            aria-label={t("close")}
            className="modal-close"
            type="button"
            onClick={close}
          >
            ×
          </button>
        </header>
        <div className="form-grid">
          <label>
            {t("salaryPaymentDate")}
            <DateInput
              className="field"
              value={values.paymentDate}
              onChange={(event) =>
                setValues({ ...values, paymentDate: event.target.value })
              }
              required
            />
          </label>
          <label>
            <span>
              {t("salaryEventsFrom")} <InfoTip text={t("salaryEventsTip")} />
            </span>
            <DateInput
              className="field"
              value={values.eventFrom}
              onChange={(event) =>
                setValues({ ...values, eventFrom: event.target.value })
              }
              required
            />
          </label>
          <label>
            {t("salaryEventsTo")}
            <DateInput
              className="field"
              value={values.eventTo}
              min={values.eventFrom}
              onChange={(event) =>
                setValues({ ...values, eventTo: event.target.value })
              }
              required
            />
          </label>
        </div>
        <fieldset className="access-section salary-people">
          <legend>
            {t("salaryWhoToPay")
              .replace("{chosen}", String(chosen.length))
              .replace("{total}", String(candidates.length))}
          </legend>
          {!candidates.length && (
            <p className="muted">{t("salaryNoCandidates")}</p>
          )}
          {candidates.map((candidate) => (
            <label className="checkbox-row" key={candidate.userId}>
              <input
                type="checkbox"
                checked={chosen.includes(candidate.userId)}
                disabled={locked.has(candidate.userId)}
                onChange={(event) =>
                  setChosen((current) =>
                    event.target.checked
                      ? [...current, candidate.userId]
                      : current.filter((id) => id !== candidate.userId),
                  )
                }
              />
              <span>
                {candidate.name} · {t(compensationModelLabels[candidate.model])}{" "}
                · {formatKronor(candidate.monthlyMinor, locale)} kr
              </span>
              {candidate.payrollMissing && (
                <span className="salary-status salary-status-problem">
                  {t("salaryProblem_payrollProfileMissing")}
                </span>
              )}
              {locked.has(candidate.userId) && (
                <InfoTip text={t("salaryPersonLocked")} />
              )}
            </label>
          ))}
        </fieldset>
        {error && <p className="notice notice-error">{error}</p>}
        <footer className="modal-actions">
          <button className="button secondary" type="button" onClick={close}>
            {t("cancel")}
          </button>
          <button className="button" disabled={busy}>
            {busy ? t("generating") : t("generateSalaryRows")}
          </button>
        </footer>
      </form>
    </div>
  );
}

function BookDialog({
  rows,
  close,
  onDone,
}: {
  rows: SalaryRow[];
  close(): void;
  onDone(): void;
}) {
  const { t, locale } = useLocale();
  const [mode, setMode] = useState<"net" | "netPlusTax">("netPlusTax");
  const [employerFee, setEmployerFee] = useState(true);
  const [feePercent, setFeePercent] = useState("31.42");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const feeBps = Math.round(Number(feePercent.replace(",", ".")) * 100);
  const feeValid =
    !employerFee ||
    (Number.isFinite(feeBps) && feeBps >= 0 && feeBps <= 10_000);
  const feeTotal = rows.reduce(
    (sum, row) => sum + employerFeeMinor(row.totals.taxableMinor, feeBps || 0),
    0,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!feeValid) return;
    setBusy(true);
    setError("");
    const failure = await postSalaryAction({
      action: "bookSalarySlips",
      slipIds: rows.map((row) => row.id),
      mode,
      employerFee,
      employerFeeBps: employerFee ? feeBps : 0,
    });
    setBusy(false);
    if (failure) setError(salaryError(t, failure));
    else onDone();
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal modal-small"
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-salaries-title"
        onSubmit={submit}
      >
        <header className="modal-header">
          <div>
            <h2 id="book-salaries-title">
              {t("bookSalariesTitle").replace("{count}", String(rows.length))}
            </h2>
            <p>{t("bookSalariesExplanation")}</p>
          </div>
          <button
            aria-label={t("close")}
            className="modal-close"
            type="button"
            onClick={close}
          >
            ×
          </button>
        </header>
        <fieldset className="access-section">
          <legend>{t("bookSalariesWhat")}</legend>
          <label className="checkbox-row">
            <input
              type="radio"
              name="mode"
              checked={mode === "net"}
              onChange={() => setMode("net")}
            />
            <span>{t("bookSalariesNet")}</span>
            <InfoTip text={t("bookSalariesNetTip")} />
          </label>
          <label className="checkbox-row">
            <input
              type="radio"
              name="mode"
              checked={mode === "netPlusTax"}
              onChange={() => setMode("netPlusTax")}
            />
            <span>{t("bookSalariesNetPlusTax")}</span>
            <InfoTip text={t("bookSalariesNetPlusTaxTip")} />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={employerFee}
              onChange={(event) => setEmployerFee(event.target.checked)}
            />
            <span>{t("bookEmployerFee")}</span>
            <InfoTip text={t("bookEmployerFeeTip")} />
          </label>
          {employerFee && (
            <label>
              {t("employerFeePercent")}
              <input
                className="field"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={feePercent}
                onChange={(event) => setFeePercent(event.target.value)}
                required
              />
              <span className="muted">
                {t("employerFeeTotal").replace(
                  "{amount}",
                  formatKronor(feeTotal, locale),
                )}
              </span>
            </label>
          )}
        </fieldset>
        {error && <p className="notice notice-error">{error}</p>}
        <footer className="modal-actions">
          <button className="button secondary" type="button" onClick={close}>
            {t("cancel")}
          </button>
          <button className="button" disabled={busy || !feeValid}>
            {t("bookSalaries")}
          </button>
        </footer>
      </form>
    </div>
  );
}
