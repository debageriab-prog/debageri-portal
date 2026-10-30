"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { sendReminders } from "./send-reminders";

export function ReminderPanel({
  selectedUserId,
  settingsConfigured,
  alreadySentToday,
  nothingMissing,
}: {
  selectedUserId?: string;
  settingsConfigured: boolean;
  alreadySentToday: boolean;
  nothingMissing: boolean;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(alreadySentToday);
  const [success, setSuccess] = useState("");

  async function send() {
    if (!selectedUserId) return;
    setBusy(true);
    setError("");
    setSuccess("");
    const result = await sendReminders([selectedUserId]);
    setBusy(false);
    if (result.failed) return setError(result.error || t("reminderSendFailed"));
    if (!result.sent) return setError(t("reminderSkipped"));
    setSent(true);
    setSuccess(t("reminderSentSuccessfully"));
    router.refresh();
  }

  return (
    <>
      {!settingsConfigured && (
        <p className="notice notice-error">{t("reminderSettingsMissing")}</p>
      )}
      {error && <p className="notice notice-error">{error}</p>}
      {success && <p className="notice">{success}</p>}
      {sent && !success && <p className="notice">{t("reminderAlreadySent")}</p>}
      <footer className="modal-actions">
        <button
          className="button"
          disabled={
            !selectedUserId ||
            !settingsConfigured ||
            nothingMissing ||
            sent ||
            busy
          }
          onClick={send}
        >
          {busy ? t("sendingReminder") : t("sendReminder")}
        </button>
      </footer>
    </>
  );
}
