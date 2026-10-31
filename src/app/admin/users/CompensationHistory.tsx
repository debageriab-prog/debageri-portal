"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { DateInput } from "@/components/ui/DateInput";
import { useLocale } from "@/components/localization/LocaleProvider";
import { formatSek } from "@/domain/finance/calculations";
import {
  COMPENSATION_END_CONFIRMATION,
  compensationInput,
  compensationModelLabels,
  defaultCompensationValues,
  previousDay,
  type CompensationRecord,
} from "@/domain/finance/compensation";
import {
  CompensationFields,
  postCompensationAction,
} from "./CompensationFields";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function CompensationTable({
  agreements,
  canEnd,
  onEnd,
}: {
  agreements: CompensationRecord[];
  canEnd: boolean;
  onEnd(agreement: CompensationRecord): void;
}) {
  const { t, locale } = useLocale();
  if (!agreements.length)
    return <p className="muted">{t("noCompensationRecords")}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t("compensationModel")}</th>
            <th>{t("validFrom")}</th>
            <th>{t("validTo")}</th>
            <th>{t("compensationTerms")}</th>
            {canEnd && (
              <th>
                <span className="sr-only">{t("actions")}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {agreements.map((agreement) => (
            <tr key={agreement.id}>
              <td>{t(compensationModelLabels[agreement.model])}</td>
              <td>{agreement.validFrom}</td>
              <td>{agreement.validTo ?? "—"}</td>
              <td>
                {[
                  agreement.fixedMonthlySalaryMinor !== null &&
                    `${t("monthlySalary")}: ${formatSek(agreement.fixedMonthlySalaryMinor, locale)}`,
                  agreement.model !== "fixed" &&
                    `${t("invoiceSharePercent")}: ${agreement.shareBps / 100}%`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </td>
              {canEnd && (
                <td>
                  {agreement.validTo === null && (
                    <button
                      className="table-action icon-action"
                      type="button"
                      aria-label={t("setValidTo")}
                      title={t("setValidTo")}
                      onClick={() => onEnd(agreement)}
                    >
                      <ActionIcon type="edit" />
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Rendered outside the employee form, since it is a form of its own. */
export function AddCompensationDialog({
  employee,
  openAgreement,
  close,
  onSaved,
}: {
  employee: { id: string; displayName: string };
  openAgreement: CompensationRecord | null;
  close(): void;
  onSaved(): void;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [values, setValues] = useState(() =>
    defaultCompensationValues(today()),
  );
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const failure = await postCompensationAction({
        action: "setCompensation",
        userId: employee.id,
        ...compensationInput(values),
        ...(confirmation ? { confirmation } : {}),
      });
      if (failure) {
        setError(t(`financeError_${failure}` as Parameters<typeof t>[0]));
        return;
      }
      onSaved();
      router.refresh();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
      setConfirming(false);
      setConfirmation("");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // An earlier start date is refused by the server, so nothing would end.
    if (openAgreement && values.validFrom > openAgreement.validFrom)
      setConfirming(true);
    else void save();
  }

  if (confirming && openAgreement)
    return (
      <div className="modal-backdrop" role="presentation">
        <form
          className="modal modal-small"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="end-current-compensation-title"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <header className="modal-header">
            <div>
              <h2 id="end-current-compensation-title">
                {t("endCurrentCompensationTitle")}
              </h2>
              <p>
                {t("endCurrentCompensationExplanation")
                  .replace("{validFrom}", openAgreement.validFrom)
                  .replace("{validTo}", previousDay(values.validFrom))}
              </p>
            </div>
          </header>
          <label>
            {t("typeConfirmation")}{" "}
            <strong>{COMPENSATION_END_CONFIRMATION}</strong>
            <input
              className="field"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              autoFocus
            />
          </label>
          <footer className="modal-actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setConfirming(false);
                setConfirmation("");
              }}
            >
              {t("cancel")}
            </button>
            <button
              className="button"
              disabled={busy || confirmation !== COMPENSATION_END_CONFIRMATION}
            >
              {t("saveCompensation")}
            </button>
          </footer>
        </form>
      </div>
    );

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-compensation-title"
        onSubmit={submit}
      >
        <header className="modal-header">
          <div>
            <h2 id="add-compensation-title">{t("addCompensation")}</h2>
            <p>
              {t("newCompensationDescription").replace(
                "{name}",
                employee.displayName,
              )}
            </p>
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
          <CompensationFields
            values={values}
            onChange={(change) =>
              setValues((current) => ({ ...current, ...change }))
            }
          />
        </div>
        {error && <p className="notice notice-error">{error}</p>}
        <footer className="modal-actions">
          <button className="button secondary" type="button" onClick={close}>
            {t("cancel")}
          </button>
          <button className="button" disabled={busy}>
            {t("saveCompensation")}
          </button>
        </footer>
      </form>
    </div>
  );
}

/** Rendered outside the employee form, since it is a form of its own. */
export function EndCompensationDialog({
  agreement,
  close,
  onSaved,
}: {
  agreement: CompensationRecord;
  close(): void;
  onSaved(): void;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const failure = await postCompensationAction({
        action: "setCompensationValidTo",
        agreementId: agreement.id,
        validTo: form.get("validTo"),
      });
      if (failure) {
        setError(t(`financeError_${failure}` as Parameters<typeof t>[0]));
        return;
      }
      onSaved();
      router.refresh();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal modal-small"
        role="alertdialog"
        aria-modal="true"
        onSubmit={submit}
      >
        <header className="modal-header">
          <div>
            <h2>{t("setValidToTitle")}</h2>
            <p>{t("setValidToExplanation")}</p>
          </div>
        </header>
        <label>
          {t("validTo")}
          <DateInput
            className="field"
            name="validTo"
            min={agreement.validFrom}
            defaultValue={
              today() > agreement.validFrom ? today() : agreement.validFrom
            }
            required
          />
        </label>
        {error && <p className="notice notice-error">{error}</p>}
        <footer className="modal-actions">
          <button className="button secondary" type="button" onClick={close}>
            {t("cancel")}
          </button>
          <button className="button" disabled={busy}>
            {t("confirmSetValidTo")}
          </button>
        </footer>
      </form>
    </div>
  );
}
