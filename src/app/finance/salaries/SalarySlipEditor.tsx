"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { DateInput } from "@/components/ui/DateInput";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  articleKind,
  lineAmountMinor,
  lineDirection,
  MANUAL_SALARY_ARTICLES,
  SALARY_LINE_ITEMS,
  type SalaryArticle,
  type SalaryLine,
  type SalaryLineDirection,
  type SalaryLineItem,
} from "@/domain/salary/articles";
import { ONE_TIME_ITEMS } from "@/domain/salary/one-time-tax";
import { copiedSalaryLines, isAddedLine } from "@/domain/salary/slip";
import type { TaxTableRow } from "@/domain/salary/tax";
import { salaryTotals } from "@/domain/salary/totals";
import { PayslipPdfButton } from "./PayslipPdfButton";
import type { SalaryRow, SalaryTimeSummary } from "./salary-data";
import { TimeReportSummary } from "./TimeReportSummary";
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
  /** Payment or deduction; lines added by hand pick it and type a price. */
  direction: SalaryLineDirection;
  /** A common item, `custom` for a name typed by hand, or none. */
  item: SalaryLineItem | "custom" | "";
  label: string;
  description: string;
  from: string;
  to: string;
  scope: string;
  quantity: string;
  price: string;
  manual: boolean;
  /** Taxed as a one-time payment (engångsskatt). */
  oneTime: boolean;
}

/** Whether a line can be a one-time payment: taxable pay that is paid out. */
const canBeOneTime = (values: Pick<LineValues, "article" | "direction">) =>
  articleKind(values.article) === "pay" && values.direction === "payment";

const isOneTimeItem = (item: LineValues["item"]) =>
  (ONE_TIME_ITEMS as readonly string[]).includes(item);

/** Lines added by hand, as opposed to built from the agreement and time. */
const isAdded = (id: string) => isAddedLine({ id });

function toValues(line: SalaryLine): LineValues {
  const plain = (value: number) => (value / 100).toFixed(2);
  const added = isAdded(line.id);
  return {
    id: line.id,
    article: line.article,
    direction: lineDirection(line),
    item: line.item ?? (line.label ? "custom" : ""),
    label: line.label,
    description: line.description ?? "",
    from: line.from ?? "",
    to: line.to ?? "",
    scope: plain(line.scopeBps),
    quantity: plain(line.quantityHundredths),
    // Lines added by hand show the price without a sign; the direction
    // decides whether it is paid out or taken off.
    price: plain(added ? Math.abs(line.unitPriceMinor) : line.unitPriceMinor),
    manual: line.manual,
    oneTime: line.oneTime === true,
  };
}

/** The typed line as stored, or null when it cannot be read yet. */
function toLine(values: LineValues): SalaryLine | null {
  const scope = parseQuantity(values.scope);
  const quantity = parseQuantity(values.quantity);
  const price = parseMoney(values.price);
  if (scope === null || quantity === null || price === null) return null;
  const added = isAdded(values.id);
  const label = values.item === "custom" || !added ? values.label.trim() : "";
  if (added && (!values.item || (values.item === "custom" && !label)))
    return null;
  return {
    id: values.id,
    article: values.article,
    label,
    item: values.item && values.item !== "custom" ? values.item : null,
    description: values.description.trim(),
    from: values.from || null,
    to: values.to || null,
    scopeBps: scope,
    quantityHundredths: quantity,
    unitPriceMinor: added
      ? (values.direction === "deduction" ? -1 : 1) * Math.abs(price)
      : price,
    manual: values.manual,
    oneTime: values.oneTime && canBeOneTime(values),
  };
}

export function articleName(
  t: Translate,
  line: Pick<SalaryLine, "article" | "label" | "item" | "description">,
) {
  const name =
    line.label ||
    t(
      (line.item
        ? `salaryItem_${line.item}`
        : `salaryArticle_${line.article}`) as MessageKey,
    );
  return line.description ? `${name} – ${line.description}` : name;
}

export function SalarySlipEditor({
  row,
  taxRows,
  timeSummary,
  previous,
  canEdit,
  canBook,
}: {
  row: SalaryRow;
  /** The person's monthly tax table, so the tax follows each change. */
  taxRows: TaxTableRow[] | null;
  /** Approved and not yet approved time of the event period. */
  timeSummary: SalaryTimeSummary;
  /** Lines added by hand to the person's previous month, to copy. */
  previous: { period: string; lines: SalaryLine[] };
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
  // The same calculation as the server, so the tax follows every change
  // before saving. Without a table the tax stays at zero, as on the server.
  const preview = valid
    ? salaryTotals(parsed as SalaryLine[], {
        table: taxRows ? { rows: taxRows } : null,
        column: row.tax.column,
        adjustment: row.tax.adjustment,
        year: row.tax.year,
        oneTimeEarlierMinor: row.oneTimeEarlierMinor,
        overrideMinor:
          taxOverride ??
          (row.tax.adjustment.type === "none" && !taxRows ? 0 : null),
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
          {row.hasPdf && (
            <PayslipPdfButton
              slipId={row.id}
              name={`${row.name} ${row.period}.pdf`}
            />
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
        {row.useTimeReports && <TimeReportSummary summary={timeSummary} />}
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
                <th className="numeric">
                  {t("salaryScope")} <InfoTip text={t("salaryScopeTip")} />
                </th>
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
                      {isAdded(line.id) && (
                        <div className="salary-line-kind">
                          <select
                            className="field"
                            aria-label={t("salaryLineDirection")}
                            value={line.direction}
                            onChange={(event) => {
                              const direction = event.target
                                .value as SalaryLineDirection;
                              change(index, {
                                direction,
                                article: MANUAL_SALARY_ARTICLES[direction][0]!,
                                oneTime:
                                  direction === "payment" &&
                                  isOneTimeItem(line.item),
                              });
                            }}
                          >
                            <option value="payment">
                              {t("salaryLinePayment")}
                            </option>
                            <option value="deduction">
                              {t("salaryLineDeduction")}
                            </option>
                          </select>
                          <select
                            className="field"
                            aria-label={t("salaryArticle")}
                            value={line.article}
                            onChange={(event) =>
                              change(index, {
                                article: event.target.value as SalaryArticle,
                                oneTime:
                                  event.target.value === "otherPay" &&
                                  isOneTimeItem(line.item),
                              })
                            }
                          >
                            {MANUAL_SALARY_ARTICLES[line.direction].map(
                              (article) => (
                                <option key={article} value={article}>
                                  {t(
                                    `salaryArticleChoice_${article}` as MessageKey,
                                  )}
                                </option>
                              ),
                            )}
                          </select>
                          <select
                            className="field"
                            aria-label={t("salaryLineItem")}
                            value={line.item}
                            required
                            onChange={(event) => {
                              const item = event.target
                                .value as LineValues["item"];
                              change(index, {
                                item,
                                // Bonuses and commission are usually
                                // one-time payments.
                                oneTime:
                                  canBeOneTime(line) && isOneTimeItem(item),
                              });
                            }}
                          >
                            <option value="">{t("salaryChooseItem")}</option>
                            {SALARY_LINE_ITEMS.map((item) => (
                              <option key={item} value={item}>
                                {t(`salaryItem_${item}` as MessageKey)}
                              </option>
                            ))}
                            <option value="custom">
                              {t("salaryItemCustom")}
                            </option>
                          </select>
                        </div>
                      )}
                      {(!isAdded(line.id) || line.item === "custom") && (
                        <input
                          className="field"
                          aria-label={t("salaryLineName")}
                          placeholder={
                            isAdded(line.id)
                              ? t("salaryLineNamePlaceholder")
                              : t(`salaryArticle_${line.article}` as MessageKey)
                          }
                          value={line.label}
                          maxLength={80}
                          required={isAdded(line.id)}
                          onChange={(event) =>
                            change(index, { label: event.target.value })
                          }
                        />
                      )}
                      <input
                        className="field"
                        aria-label={t("salaryLineDescription")}
                        placeholder={t("salaryLineDescriptionPlaceholder")}
                        value={line.description}
                        maxLength={120}
                        onChange={(event) =>
                          change(index, { description: event.target.value })
                        }
                      />
                      {isAdded(line.id) && canBeOneTime(line) && (
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={line.oneTime}
                            onChange={(event) =>
                              change(index, { oneTime: event.target.checked })
                            }
                          />
                          <span>{t("salaryOneTime")}</span>
                          <InfoTip text={t("salaryOneTimeTip")} />
                        </label>
                      )}
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
                        <ActionIcon type="delete" />
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
                    article: "otherPay",
                    direction: "payment",
                    item: "",
                    label: "",
                    description: "",
                    from: "",
                    to: "",
                    scope: "100.00",
                    quantity: "1.00",
                    price: "0.00",
                    manual: true,
                    oneTime: false,
                  },
                ])
              }
            >
              {t("addSalaryLine")}
            </button>{" "}
            <InfoTip text={t("addSalaryLineTip")} />{" "}
            {previous.lines.length > 0 && (
              <>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    const copied = copiedSalaryLines(
                      previous.lines,
                      Date.now(),
                    );
                    setLines((current) => [
                      ...current,
                      ...copied.map(toValues),
                    ]);
                    setError("");
                    setMessage(
                      t("salaryLinesCopied")
                        .replace("{count}", String(copied.length))
                        .replace("{month}", previous.period),
                    );
                  }}
                >
                  {t("copySalaryLines")}
                </button>{" "}
                <InfoTip
                  text={t("copySalaryLinesTip").replace(
                    "{month}",
                    previous.period,
                  )}
                />
              </>
            )}
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
            {preview.oneTimeTaxMinor !== 0 && (
              <>
                <dt className="salary-sub">
                  {t("salaryOneTimeTaxOf").replace(
                    "{percent}",
                    String(preview.oneTimePercent ?? 0),
                  )}
                </dt>
                <dd className="salary-sub">
                  {amount(-preview.oneTimeTaxMinor)}
                </dd>
              </>
            )}
            {preview.reimbursementsMinor !== 0 && (
              <>
                <dt>{t("salaryReimbursements")}</dt>
                <dd>{amount(preview.reimbursementsMinor)}</dd>
              </>
            )}
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
