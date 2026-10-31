"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import {
  COMPENSATION_END_CONFIRMATION,
  compensationInput,
  defaultCompensationValues,
  previousDay,
  type CompensationRecord,
} from "@/domain/finance/compensation";
import {
  CompensationFields,
  postCompensationAction,
} from "../../../CompensationFields";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function CompensationForm({
  employeeId,
  openAgreement,
}: {
  employeeId: string;
  openAgreement: CompensationRecord | null;
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
        userId: employeeId,
        ...compensationInput(values),
        ...(confirmation ? { confirmation } : {}),
      });
      if (failure) {
        setError(t(`financeError_${failure}` as Parameters<typeof t>[0]));
        return;
      }
      router.push(
        `/admin/users/${encodeURIComponent(employeeId)}/edit?tab=compensation&saved=compensation`,
      );
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

  return (
    <>
      <section className="card">
        <form className="form-grid" onSubmit={submit}>
          <CompensationFields
            values={values}
            onChange={(change) =>
              setValues((current) => ({ ...current, ...change }))
            }
          />
          <div className="form-wide actions">
            <button className="button" disabled={busy}>
              {t("saveCompensation")}
            </button>
          </div>
          {error && <p className="form-wide notice notice-error">{error}</p>}
        </form>
      </section>
      {confirming && openAgreement && (
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
                disabled={
                  busy || confirmation !== COMPENSATION_END_CONFIRMATION
                }
              >
                {t("saveCompensation")}
              </button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
