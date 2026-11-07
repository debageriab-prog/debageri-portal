"use client";

import { FormEvent, useState } from "react";
import { createPortal } from "react-dom";
import { appCheckFetch } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";
import { daysToMinutes, minutesToDays } from "@/domain/vacation/periods";
import type { VacationSummary } from "@/server/services/vacation-service";
import { formatDays } from "./VacationSummary";

const BUCKETS = ["normal", "saved", "advance"] as const;

/**
 * Sets what is left today in each bucket. Rendered in a portal because the
 * employee editor around it is a form of its own.
 */
export function AdjustVacationDialog({
  employeeId,
  summary,
  close,
  onSaved,
}: {
  employeeId: string;
  summary: VacationSummary;
  close(): void;
  onSaved(): void;
}) {
  const { t, locale } = useLocale();
  const current = {
    normal: Math.max(0, summary.balance.normal),
    saved: summary.balance.saved,
    advance: summary.balance.advance,
  };
  const [values, setValues] = useState(() => ({
    normal: String(minutesToDays(current.normal)),
    saved: String(minutesToDays(current.saved)),
    advance: String(minutesToDays(current.advance)),
  }));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const targets = Object.fromEntries(
    BUCKETS.map((bucket) => [
      bucket,
      daysToMinutes(Number(values[bucket].replace(",", ".")) || 0),
    ]),
  ) as Record<(typeof BUCKETS)[number], number>;
  const changes = BUCKETS.filter(
    (bucket) => targets[bucket] !== summary.balance[bucket],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!event.currentTarget.reportValidity()) return;
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch(
        `/api/admin/users/${encodeURIComponent(employeeId)}/vacation`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "adjustBalance",
            normalMinutes: targets.normal,
            savedMinutes: targets.saved,
            advanceMinutes: targets.advance,
            note,
          }),
        },
      );
      if (!response.ok) {
        setError(t("vacationAdjustFailed"));
        return;
      }
      onSaved();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal modal-small"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adjust-vacation-title"
        onSubmit={submit}
      >
        <header className="modal-header">
          <div>
            <h2 id="adjust-vacation-title">{t("vacationAdjustBalance")}</h2>
            <p>
              {t("vacationAdjustDescription")
                .replace("{start}", summary.period.start)
                .replace("{end}", summary.period.end)}
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
        <div className="form-grid vacation-adjust-grid">
          {BUCKETS.map((bucket) => (
            <label key={bucket}>
              {t(`vacationLeft_${bucket}`)}
              <input
                className="field"
                type="number"
                min={0}
                max={200}
                step={0.5}
                value={values[bucket]}
                onChange={(event) =>
                  setValues((state) => ({
                    ...state,
                    [bucket]: event.target.value,
                  }))
                }
                required
              />
            </label>
          ))}
          <label className="form-wide">
            {t("vacationNote")}
            <input
              className="field"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("vacationNotePlaceholder")}
              minLength={3}
              maxLength={300}
              required
            />
          </label>
        </div>
        {changes.length > 0 && (
          <div className="notice notice-warning">
            {changes.map((bucket) => (
              <p key={bucket}>
                {t("vacationChangePreview")
                  .replace("{bucket}", t(`vacationLeft_${bucket}`))
                  .replace(
                    "{from}",
                    formatDays(summary.balance[bucket], locale),
                  )
                  .replace("{to}", formatDays(targets[bucket], locale))}
              </p>
            ))}
          </div>
        )}
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button className="button secondary" type="button" onClick={close}>
            {t("cancel")}
          </button>
          <button className="button" disabled={busy || !changes.length}>
            {busy ? t("saving") : t("vacationSaveBalance")}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
