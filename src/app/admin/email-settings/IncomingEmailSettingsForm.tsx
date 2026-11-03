"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { InfoTip } from "@/components/ui/InfoTip";
import { MAX_TRUSTED_SENDERS } from "@/domain/incoming-email";
import { appCheckFetch } from "@/lib/firebase/client";

export type IncomingEmailSettingsState = {
  enabled: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUsername: string;
  passwordConfigured: boolean;
  folder: string;
  trustedSenders: string[];
};

type Sender = { id: string; email: string };

const KNOWN_ERRORS = [
  "mailboxPasswordRequired",
  "mailboxAuthFailed",
  "mailboxFolderMissing",
  "mailboxConnectionFailed",
] as const;

/** The finance mailbox the portal reads, and who may send to it. */
export function IncomingEmailSettingsForm({
  settings,
  aiEnabled,
}: {
  settings: IncomingEmailSettingsState;
  aiEnabled: boolean;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [mailbox, setMailbox] = useState({
    imapHost: settings.imapHost,
    imapPort: settings.imapPort,
    imapSecure: settings.imapSecure,
    imapUsername: settings.imapUsername,
    password: "",
    folder: settings.folder,
  });
  const [enabled, setEnabled] = useState(settings.enabled);
  const [senders, setSenders] = useState<Sender[]>(
    settings.trustedSenders.map((email) => ({
      id: crypto.randomUUID(),
      email,
    })),
  );
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function errorText(code: unknown, fallback: string) {
    return KNOWN_ERRORS.includes(code as (typeof KNOWN_ERRORS)[number])
      ? t(`incomingEmailError_${code as (typeof KNOWN_ERRORS)[number]}`)
      : fallback;
  }

  function change(update: Partial<typeof mailbox>) {
    setMessage("");
    setMailbox((current) => ({ ...current, ...update }));
  }

  const connection = () => ({
    ...mailbox,
    imapHost: mailbox.imapHost.trim(),
    imapUsername: mailbox.imapUsername.trim(),
    folder: mailbox.folder.trim() || "INBOX",
    password: mailbox.password || undefined,
  });

  async function test() {
    setError("");
    setMessage("");
    setBusy("test");
    try {
      const response = await appCheckFetch(
        "/api/admin/incoming-email-settings",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(connection()),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(errorText(body?.error, t("incomingEmailTestFailed")));
        return;
      }
      setMessage(t("incomingEmailTestSucceeded"));
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(null);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const emails = senders
      .map((sender) => sender.email.trim().toLowerCase())
      .filter(Boolean);
    if (new Set(emails).size !== emails.length) {
      setError(t("incomingEmailSenderDuplicate"));
      return;
    }
    setBusy("save");
    try {
      const response = await appCheckFetch(
        "/api/admin/incoming-email-settings",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...connection(),
            enabled,
            trustedSenders: emails,
          }),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(errorText(body?.error, t("incomingEmailSaveFailed")));
        return;
      }
      setMailbox((current) => ({ ...current, password: "" }));
      setMessage(t("incomingEmailSaved"));
      router.refresh();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <form
      className="reminder-settings-form incoming-email-settings"
      onSubmit={save}
    >
      <p className="muted editor-panel-intro">
        {t("incomingEmailSettingsDescription")}
      </p>
      {!aiEnabled && (
        <p className="notice notice-warning">
          {t("incomingEmailAiOff")}{" "}
          <Link href="/admin/ai-integration">{t("aiIntegration")}</Link>
        </p>
      )}

      <h3>{t("incomingEmailMailbox")}</h3>
      <div className="form-grid">
        <label>
          {t("imapHost")}
          <InfoTip text={t("imapHostTip")} />
          <input
            className="field"
            value={mailbox.imapHost}
            placeholder="imap.gmail.com"
            onChange={(event) => change({ imapHost: event.target.value })}
            required
          />
        </label>
        <label>
          {t("imapPort")}
          <input
            className="field"
            type="number"
            min="1"
            max="65535"
            value={mailbox.imapPort}
            onChange={(event) =>
              change({ imapPort: Number(event.target.value) })
            }
            required
          />
        </label>
        <label>
          {t("imapUsername")}
          <input
            className="field"
            value={mailbox.imapUsername}
            autoComplete="off"
            onChange={(event) => change({ imapUsername: event.target.value })}
            required
          />
        </label>
        <label>
          {t("imapPassword")}
          <InfoTip text={t("imapPasswordTip")} />
          <input
            className="field"
            type="password"
            value={mailbox.password}
            autoComplete="new-password"
            placeholder={
              settings.passwordConfigured ? t("leaveBlankPassword") : ""
            }
            onChange={(event) => change({ password: event.target.value })}
            required={!settings.passwordConfigured}
          />
        </label>
        <label>
          {t("imapFolder")}
          <InfoTip text={t("imapFolderTip")} />
          <input
            className="field"
            value={mailbox.folder}
            onChange={(event) => change({ folder: event.target.value })}
            required
          />
        </label>
        <label className="checkbox-row form-wide">
          <input
            type="checkbox"
            checked={mailbox.imapSecure}
            onChange={(event) => change({ imapSecure: event.target.checked })}
          />
          <span>{t("imapSecure")}</span>
          <InfoTip text={t("imapSecureTip")} />
        </label>
        <label className="checkbox-row form-wide">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => {
              setMessage("");
              setEnabled(event.target.checked);
            }}
          />
          <span>{t("incomingEmailEnabled")}</span>
          <InfoTip text={t("incomingEmailEnabledTip")} />
        </label>
      </div>
      <div className="actions">
        <button
          className="button secondary"
          type="button"
          disabled={busy !== null || !mailbox.imapHost || !mailbox.imapUsername}
          onClick={test}
        >
          {busy === "test" ? t("incomingEmailTesting") : t("incomingEmailTest")}
        </button>
      </div>

      <h3>{t("incomingEmailTrustedSenders")}</h3>
      <p className="muted">{t("incomingEmailTrustedSendersDescription")}</p>
      {senders.length === 0 && (
        <p className="muted">{t("incomingEmailNoTrustedSenders")}</p>
      )}
      {senders.map((sender, index) => (
        <div className="incoming-sender-row" key={sender.id}>
          <label className="incoming-sender-field">
            <span className="sr-only">
              {t("incomingEmailTrustedSender").replace(
                "{number}",
                String(index + 1),
              )}
            </span>
            <input
              className="field"
              type="email"
              value={sender.email}
              maxLength={254}
              autoComplete="off"
              placeholder="name@example.com"
              onChange={(event) => {
                setMessage("");
                setSenders((current) =>
                  current.map((item) =>
                    item.id === sender.id
                      ? { ...item, email: event.target.value }
                      : item,
                  ),
                );
              }}
              required
            />
          </label>
          <button
            className="table-action table-action-danger icon-action"
            type="button"
            aria-label={t("incomingEmailRemoveSender").replace(
              "{email}",
              sender.email || String(index + 1),
            )}
            title={t("incomingEmailRemoveSender").replace(
              "{email}",
              sender.email || String(index + 1),
            )}
            onClick={() => {
              setMessage("");
              setSenders((current) =>
                current.filter((item) => item.id !== sender.id),
              );
            }}
          >
            <ActionIcon type="delete" />
          </button>
        </div>
      ))}
      <div className="actions">
        <button
          className="button secondary"
          type="button"
          disabled={senders.length >= MAX_TRUSTED_SENDERS}
          onClick={() => {
            setMessage("");
            setSenders((current) => [
              ...current,
              { id: crypto.randomUUID(), email: "" },
            ]);
          }}
        >
          {t("incomingEmailAddSender")}
        </button>
        <button className="button" disabled={busy !== null}>
          {busy === "save" ? t("saving") : t("saveChanges")}
        </button>
      </div>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice notice-success" role="status">
          {message}
        </p>
      )}
    </form>
  );
}
