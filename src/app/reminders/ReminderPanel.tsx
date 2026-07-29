"use client";

import { useState } from "react";
import { appCheckFetch } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";

export function ReminderPanel({
  selectedUserId,
  settingsConfigured,
  alreadySentToday,
}: {
  selectedUserId?: string;
  settingsConfigured: boolean;
  alreadySentToday: boolean;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(alreadySentToday);

  async function send() {
    if (!selectedUserId) return;
    setBusy(true);
    setError("");
    const response = await appCheckFetch("/api/reminders/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setBusy(false);
    if (!response.ok) return setError(result.error ?? t("reminderSendFailed"));
    setSent(true);
  }

  return (
    <>
      {!settingsConfigured && (
        <p className="notice notice-error">{t("reminderSettingsMissing")}</p>
      )}
      {error && <p className="notice notice-error">{error}</p>}
      {sent && <p className="notice">{t("reminderAlreadySent")}</p>}
      <button
        className="button"
        disabled={!selectedUserId || !settingsConfigured || sent || busy}
        onClick={send}
      >
        {busy ? t("sendingReminder") : t("sendReminder")}
      </button>
    </>
  );
}
