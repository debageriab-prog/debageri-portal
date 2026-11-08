"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { DateInput } from "@/components/ui/DateInput";
import { FileRemoveIcon } from "@/components/ui/FileActionIcons";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  lineAmountMinor,
  MANUAL_SALARY_ARTICLES,
  type SalaryArticle,
  type SalaryLine,
} from "@/domain/salary/articles";
import { salaryTotals } from "@/domain/salary/totals";
import { payslipFileUrl } from "@/app/documents/payslips/PayslipPreview";
import type { SalaryRow } from "./salary-data";
import {
  formatHundredths,
  parseMoney,
  parseQuantity,
  postSalaryAction,
} from "./salary-client";
import { salaryError, SalaryStatus } from "./SalaryRun";

type Translate = ReturnType<typeof useLocale>["t"];
type MessageKey = Parameters<Translate>[0];

/** A line as typed: numbers are still text. */
interface LineValues {
  id: string;
  article: SalaryArticle;
  label: string;
  from: string;
  to: string;
  scope: string;
  quantity: string;
  price: string;
  manual: boolean;
}

function toValues(line: SalaryLine): LineValues {
  const plain = (value: number) => (value / 100).toFixed(2);
  return {
    id: line.id,
    article: line.article,
    label: line.label,
    from: line.from ?? "",
    to: line.to ?? "",
    scope: plain(line.scopeBps),
    quantity: plain(line.quantityHundredths),
    price: plain(line.unitPriceMinor),
    manual: line.manual,
  };
}

/** The typed line as stored, or null when a number cannot be read. */
function toLine(values: LineValues): SalaryLine | null {
  const scope = parseQuantity(values.scope);
  const quantity = parseQuantity(values.quantity);
  const price = parseMoney(values.price);
  if (scope === null || quantity === null || price === null) return null;
  return {
    id: values.id,
    article: values.article,
    label: values.label.trim(),
    from: values.from || null,
    to: values.to || null,
    scopeBps: scope,
    quantityHundredths: quantity,
    unitPriceMinor: price,
    manual: values.manual,
  };
}

export function articleName(
  t: Translate,
  line: Pick<SalaryLine, "article" | "label">,
) {
  return line.label || t(`salaryArticle_${line.article}` as MessageKey);
}

export function SalarySlipEditor({
  row,
  canEdit,
  canBook,
}: {
  row: SalaryRow;
  canEdit: boolean;
  canBook: boolean;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const editing = canEdit && row.status === "initiated";
  const [lines, setLines] = useState(() => row.lines.map(toValues));
  const [taxTyped, setTaxTyped] = useState(row.tax.overrideMinor !== null);
  const [taxText, setTaxText] = useState(
    row.tax.overrideMinor === null
      ? ""
      : (row.tax.overrideMinor / 100).toFixed(2),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reversing, setReversing] = useState(false);

  const parsed = lines.map(toLine);
  const valid = parsed.every((line) => line !== null);
  const taxOverride = taxTyped ? parseMoney(taxText) : null;
  // The table tax is worked out on the server; until saving, the preview
  // keeps the last saved tax unless one is typed.
  const preview = valid
    ? salaryTotals(parsed as SalaryLine[], {
        table: null,
        column: row.tax.column,
        adjustment: { type: "none" },
        overrideMinor: taxOverride ?? row.totals.taxMinor,
      })
    : row.totals;

  function change(index: number, values: Partial<LineValues>) {
    setLines((current) =>
      current.map((line, at) =>
        at === index ? { ...line, ...values, manual: true } : line,
      ),
    );
  }

  async function save(markReady: boolean) {
    if (!valid || (taxTyped && taxOverride === null)) {
      setError(t("salaryLinesInvalid"));
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    const failure = await postSalaryAction({
      action: "updateSalarySlip",
      slipId: row.id,
      version: row.version,
      lines: parsed,
      taxOverrideMinor: taxOverride,
    });
    if (failure) {
      setBusy(false);
      setError(salaryError(t, failure));
      return;
    }
    if (markReady) {
      const readyFailure = await postSalaryAction({
        action: "setSalarySlipStatus",
        slipIds: [row.id],
        status: "ready",
      });
      setBusy(false);
      if (readyFailure) {
        setError(salaryError(t, readyFailure));
        router.refresh();
        return;
      }
      router.push(`/finance/salaries?period=${row.period}`);
      router.refresh();
      return;
    }
    setBusy(false);
    setMessage(t("salaryRowSaved"));
    router.refresh();
  }

  async function changeTimeReports(value: boolean) {
    setBusy(true);
    setError("");
    setMessage("");
    const failure = await postSalaryAction({
      action: "setSalarySlipTimeReports",
      slipId: row.id,
      version: row.version,
      useTimeReports: value,
    });
    setBusy(false);
    if (failure) setError(salaryError(t, failure));
    else router.refresh();
  }

  async function reopen() {
    setBusy(true);
    setError("");
    const failure = await postSalaryAction({
      action: "setSalarySlipStatus",
      slipIds: [row.id],
      status: "initiated",
    });
    setBusy(false);
    if (failure) setError(salaryError(t, failure));
    else router.refresh();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(false);
  }

  const amount = (minor: number) => formatHundredths(minor, locale);

  return (
    <>
      <form className="card salary-editor" onSubmit={submit} noValidate>
        <div className="salary-editor-head">
          <SalaryStatus row={row} />
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
        </div>
        {row.problem && (
          <p className="notice notice-warning">
            {t(`salaryProblemHelp_${row.problem}` as MessageKey)}
          </p>
        )}

        {editing ? (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={row.useTimeReports}
              disabled={busy}
              onChange={(event) => void changeTimeReports(event.target.checked)}
            />
            <span>
              {t("salaryUseTimeReports")
                .replace("{eventFrom}", row.eventFrom)
                .replace("{eventTo}", row.eventTo)}
            </span>
            <InfoTip text={t("salaryUseTimeReportsTip")} />
          </label>
        ) : (
          !row.useTimeReports && (
            <p className="muted">{t("salaryTimeReportsIgnored")}</p>
          )
        )}
        {row.useTimeReports && row.reportedDays === 0 && (
          <p className="notice notice-warning">
            {t("salaryNoTimeReports")
              .replace("{eventFrom}", row.eventFrom)
              .replace("{eventTo}", row.eventTo)}
          </p>
        )}

        <div className="table-wrap">
          <table className="salary-lines">
            <thead>
              <tr>
                <th>{t("salaryLine")}</th>
                <th>{t("salaryFrom")}</th>
                <th>{t("salaryTo")}</th>
                <th className="numeric">{t("salaryScope")}</th>
                <th className="numeric">{t("salaryQuantity")}</th>
                <th className="numeric">{t("salaryPrice")}</th>
                <th className="numeric">{t("salaryAmount")}</th>
                {editing && (
                  <th>
                    <span className="sr-only">{t("actions")}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const stored = parsed[index];
                if (!editing)
                  return (
                    <tr key={line.id}>
                      <td>{articleName(t, stored ?? row.lines[index]!)}</td>
                      <td>{line.from}</td>
                      <td>{line.to}</td>
                      <td className="numeric">{line.scope}</td>
                      <td className="numeric">{line.quantity}</td>
                      <td className="numeric">{line.price}</td>
                      <td className="numeric">
                        {stored ? amount(lineAmountMinor(stored)) : "—"}
                      </td>
                    </tr>
                  );
                return (
                  <tr key={line.id}>
                    <td>
                      {line.manual &&
                      MANUAL_SALARY_ARTICLES.includes(line.article) ? (
                        <select
                          className="field"
                          aria-label={t("salaryArticle")}
                          value={line.article}
                          onChange={(event) =>
                            change(index, {
                              article: event.target.value as SalaryArticle,
                            })
                          }
                        >
                          {MANUAL_SALARY_ARTICLES.map((article) => (
                            <option key={article} value={article}>
                              {t(`salaryArticle_${article}` as MessageKey)}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <input
                        className="field"
                        aria-label={t("salaryLineName")}
                        placeholder={t(
                          `salaryArticle_${line.article}` as MessageKey,
                        )}
                        value={line.label}
                        maxLength={80}
                        onChange={(event) =>
                          change(index, { label: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <DateInput
                        className="field"
                        aria-label={t("salaryFrom")}
                        value={line.from}
                        onChange={(event) =>
                          change(index, { from: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <DateInput
                        className="field"
                        aria-label={t("salaryTo")}
                        value={line.to}
                        onChange={(event) =>
                          change(index, { to: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="field numeric"
                        aria-label={t("salaryScope")}
                        inputMode="decimal"
                        value={line.scope}
                        onChange={(event) =>
                          change(index, { scope: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="field numeric"
                        aria-label={t("salaryQuantity")}
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(event) =>
                          change(index, { quantity: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="field numeric"
                        aria-label={t("salaryPrice")}
                        inputMode="decimal"
                        value={line.price}
                        onChange={(event) =>
                          change(index, { price: event.target.value })
                        }
                      />
                    </td>
                    <td className="numeric">
                      {stored ? amount(lineAmountMinor(stored)) : "—"}
                    </td>
                    <td>
                      <button
                        className="table-action table-action-danger icon-action"
                        type="button"
                        aria-label={t("remove")}
                        title={t("remove")}
                        onClick={() =>
                          setLines((current) =>
                            current.filter((_, at) => at !== index),
                          )
                        }
                      >
                        <FileRemoveIcon />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {editing && (
          <p>
            <button
              className="button secondary"
              type="button"
              onClick={() =>
                setLines((current) => [
                  ...current,
                  {
                    id: `manual-${Date.now()}`,
                    article: "bonus",
                    label: "",
                    from: "",
                    to: "",
                    scope: "100.00",
                    quantity: "1.00",
                    price: "0.00",
                    manual: true,
                  },
                ])
              }
            >
              {t("addSalaryLine")}
            </button>{" "}
            <InfoTip text={t("addSalaryLineTip")} />
          </p>
        )}

        <div className="salary-summary">
          <div className="salary-tax">
            <p>
              {row.tax.overrideMinor === null &&
              row.tax.adjustment.type === "none" &&
              row.tax.table !== null
                ? t("salaryTaxFromTable")
                    .replace("{table}", String(row.tax.table))
                    .replace("{column}", String(row.tax.column))
                : row.tax.adjustment.type !== "none"
                  ? t("salaryTaxAdjusted")
                  : t("salaryTaxTyped")}
            </p>
            {editing && (
              <>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={taxTyped}
                    onChange={(event) => setTaxTyped(event.target.checked)}
                  />
                  <span>{t("salaryTypeTax")}</span>
                  <InfoTip text={t("salaryTypeTaxTip")} />
                </label>
                {taxTyped && (
                  <label>
                    {t("salaryTaxAmount")}
                    <input
                      className="field"
                      inputMode="decimal"
                      value={taxText}
                      onChange={(event) => setTaxText(event.target.value)}
                      required
                    />
                  </label>
                )}
              </>
            )}
          </div>
          <dl className="salary-totals">
            <dt>{t("salaryGross")}</dt>
            <dd>{amount(preview.grossMinor)}</dd>
            <dt>{t("salaryBenefits")}</dt>
            <dd>{amount(preview.benefitsMinor)}</dd>
            <dt>{t("salaryTax")}</dt>
            <dd>{amount(-preview.taxMinor)}</dd>
            {preview.netDeductionsMinor !== 0 && (
              <>
                <dt>{t("salaryNetDeductions")}</dt>
                <dd>{amount(preview.netDeductionsMinor)}</dd>
              </>
            )}
            <dt>{t("salaryRounding")}</dt>
            <dd>{amount(preview.roundingMinor)}</dd>
            <dt className="salary-net">{t("salaryNet")}</dt>
            <dd className="salary-net">{amount(preview.netMinor)}</dd>
          </dl>
        </div>
        {row.balanceMinor !== null && (
          <p className="muted">
            {t("salaryBalanceInfo").replace(
              "{balance}",
              amount(row.balanceMinor),
            )}
          </p>
        )}

        {message && <p className="notice notice-success">{message}</p>}
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <Link
            className="button secondary"
            href={`/finance/salaries?period=${row.period}`}
          >
            {editing ? t("cancel") : t("back")}
          </Link>
          {editing && (
            <>
              <button className="button secondary" disabled={busy}>
                {t("saveChanges")}
              </button>
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() => void save(true)}
              >
                {t("saveAndMarkReady")}
              </button>
            </>
          )}
          {canEdit &&
            (row.status === "ready" || row.status === "payslipGenerated") && (
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={() => void reopen()}
              >
                {t("reopenSalary")}
              </button>
            )}
          {canBook && row.status === "booked" && (
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setError("");
                setReversing(true);
              }}
            >
              <ActionIcon type="reverse" /> {t("reverseSalary")}
            </button>
          )}
        </footer>
      </form>
      {reversing && (
        <ReverseDialog
          row={row}
          close={() => setReversing(false)}
          onDone={() => {
            setReversing(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function ReverseDialog({
  row,
  close,
  onDone,
}: {
  row: SalaryRow;
  close(): void;
  onDone(): void;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get("reason"));
    setBusy(true);
    setError("");
    const failure = await postSalaryAction({
      action: "reverseSalarySlip",
      slipId: row.id,
      reason,
    });
    setBusy(false);
    if (failure) setError(salaryError(t, failure));
    else onDone();
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal modal-small"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reverse-salary-title"
        onSubmit={submit}
      >
        <header className="modal-header">
          <div>
            <h2 id="reverse-salary-title">{t("reverseSalaryTitle")}</h2>
            <p>{t("reverseSalaryExplanation")}</p>
          </div>
        </header>
        <label>
          {t("reason")}
          <input
            className="field"
            name="reason"
            minLength={3}
            maxLength={300}
            required
            autoFocus
          />
        </label>
        {error && <p className="notice notice-error">{error}</p>}
        <footer className="modal-actions">
          <button className="button secondary" type="button" onClick={close}>
            {t("cancel")}
          </button>
          <button className="button" disabled={busy}>
            {t("reverseSalary")}
          </button>
        </footer>
      </form>
    </div>
  );
}
