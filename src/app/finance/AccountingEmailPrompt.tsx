"use client";

import { useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import type { AccountingEntityType } from "@/domain/accounting-email";
import { appCheckFetch } from "@/lib/firebase/client";

const SEND_ERRORS = ["noRecipients", "emailNotConfigured", "sendFailed"];

/**
 * After a finance record is saved, asks whether to email it and its files to
 * the accounting contacts chosen for its kind. `offer` runs `onDone` right
 * away when there is nobody to ask about; render `dialog` in the form.
 */
export function useAccountingEmailPrompt(
  entityType: AccountingEntityType,
  recipients: string[],
) {
  const { t } = useLocale();
  const [pending, setPending] = useState<{
    entityId: string;
    onDone(): void;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function offer(entityId: string | undefined, onDone: () => void) {
    if (!recipients.length || !entityId) {
      onDone();
      return;
    }
    setError("");
    setPending({ entityId, onDone });
  }

  function finish() {
    const done = pending?.onDone;
    setPending(null);
    done?.();
  }

  async function send() {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch("/api/finance/accounting-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entityType, entityId: pending.entityId }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        const code = SEND_ERRORS.includes(result.error ?? "")
          ? result.error
          : "failed";
        setError(t(`accountingSendError_${code}` as Parameters<typeof t>[0]));
        return;
      }
      finish();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  const dialog = pending ? (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal modal-small"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="accounting-email-title"
        aria-describedby="accounting-email-description"
      >
        <header className="modal-header">
          <div>
            <h2 id="accounting-email-title">{t("sendToAccountingTitle")}</h2>
            <p id="accounting-email-description">
              {t("sendToAccountingText").replace(
                "{entity}",
                t(`accountingEntity_${entityType}`),
              )}
            </p>
          </div>
        </header>
        <ul className="accounting-recipient-list">
          {recipients.map((recipient) => (
            <li key={recipient}>{recipient}</li>
          ))}
        </ul>
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={finish}
          >
            {error ? t("continueWithoutSending") : t("sendToAccountingNo")}
          </button>
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={() => void send()}
          >
            {busy ? t("sendingToAccounting") : t("sendToAccountingYes")}
          </button>
        </footer>
      </section>
    </div>
  ) : null;

  return { offer, dialog };
}
