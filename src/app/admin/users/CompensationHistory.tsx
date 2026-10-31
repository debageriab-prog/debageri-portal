"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { DateInput } from "@/components/ui/DateInput";
import { useLocale } from "@/components/localization/LocaleProvider";
import { formatSek } from "@/domain/finance/calculations";
import type { CompensationRecord } from "@/domain/finance/compensation";
import { postCompensationAction } from "./CompensationFields";

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
              <td>
                {t(agreement.model === "flexible" ? "flexible" : "fixedSalary")}
              </td>
              <td>{agreement.validFrom}</td>
              <td>{agreement.validTo ?? "—"}</td>
              <td>
                {agreement.model === "flexible"
                  ? `${t("invoiceSharePercent")}: ${agreement.shareBps / 100}%`
                  : agreement.fixedMonthlySalaryMinor !== null
                    ? `${t("monthlySalary")}: ${formatSek(agreement.fixedMonthlySalaryMinor, locale)}`
                    : "—"}
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
