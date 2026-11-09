"use client";

import { FormEvent, useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { InfoTip } from "@/components/ui/InfoTip";
import { appCheckFetch } from "@/lib/firebase/client";
import { salaryError } from "./SalaryRun";

export interface AgiContactDefaults {
  name: string;
  phone: string;
  email: string;
}

/**
 * Asks who Skatteverket contacts about the month's employer declaration and
 * downloads the AGI file of its booked salaries.
 */
export function AgiDialog({
  period,
  bookedCount,
  defaults,
  close,
  onDone,
}: {
  period: string;
  bookedCount: number;
  defaults: AgiContactDefaults;
  close(): void;
  onDone(): void;
}) {
  const { t } = useLocale();
  const [contact, setContact] = useState(defaults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch("/api/finance/salaries/agi", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ period, contact }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(salaryError(t, result.error ?? "financeOperationFailed"));
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `agi-${period}.xml`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      onDone();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  const field = (
    key: keyof AgiContactDefaults,
    label: string,
    type: string,
  ) => (
    <label>
      {label}
      <input
        className="field"
        type={type}
        value={contact[key]}
        maxLength={key === "phone" ? 20 : key === "name" ? 50 : 254}
        onChange={(event) =>
          setContact((current) => ({ ...current, [key]: event.target.value }))
        }
        required
      />
    </label>
  );

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal modal-small"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agi-title"
        onSubmit={submit}
      >
        <header className="modal-header">
          <div>
            <h2 id="agi-title">{t("agiFileTitle")}</h2>
            <p>
              {t("agiFileExplanation").replace("{count}", String(bookedCount))}
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
        <fieldset className="access-section">
          <legend>
            {t("agiContact")} <InfoTip text={t("agiContactTip")} />
          </legend>
          <div className="salary-agi-fields">
            {field("name", t("agiContactName"), "text")}
            {field("phone", t("agiContactPhone"), "tel")}
            {field("email", t("agiContactEmail"), "email")}
          </div>
        </fieldset>
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button className="button secondary" type="button" onClick={close}>
            {t("cancel")}
          </button>
          <button className="button" disabled={busy}>
            {busy ? t("generating") : t("downloadAgiFile")}
          </button>
        </footer>
      </form>
    </div>
  );
}
