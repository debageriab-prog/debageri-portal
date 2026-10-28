"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  ACCOUNTING_EMAIL_PURPOSES,
  type AccountingContact,
} from "@/domain/accounting-email";
import { appCheckFetch } from "@/lib/firebase/client";

function newContact(): AccountingContact {
  return {
    id: crypto.randomUUID(),
    name: "",
    email: "",
    transactions: true,
    invoices: true,
    vatSettlements: true,
  };
}

/** Accounting email addresses and what each one receives. */
export function AccountingEmailsForm({
  contacts: initialContacts,
  emailConfigured,
}: {
  contacts: AccountingContact[];
  emailConfigured: boolean;
}) {
  const { t } = useLocale();
  const [contacts, setContacts] = useState(initialContacts);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function update(id: string, change: Partial<AccountingContact>) {
    setMessage("");
    setContacts((current) =>
      current.map((contact) =>
        contact.id === id ? { ...contact, ...change } : contact,
      ),
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const emails = contacts.map((contact) =>
      contact.email.trim().toLowerCase(),
    );
    if (new Set(emails).size !== emails.length) {
      setError(t("accountingEmailDuplicate"));
      return;
    }
    setBusy(true);
    try {
      const response = await appCheckFetch("/api/admin/accounting-emails", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contacts: contacts.map((contact) => ({
            ...contact,
            name: contact.name.trim(),
            email: contact.email.trim(),
          })),
        }),
      });
      if (!response.ok) {
        setError(t("accountingEmailsSaveFailed"));
        return;
      }
      setMessage(t("accountingEmailsSaved"));
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="accounting-emails" onSubmit={save}>
      <p className="muted">{t("accountingEmailsDescription")}</p>
      {!emailConfigured && (
        <p className="notice notice-warning">
          {t("accountingEmailsSmtpMissing")}{" "}
          <Link href="/admin/email-settings">{t("emailSettings")}</Link>
        </p>
      )}
      {contacts.length === 0 && (
        <p className="muted">{t("noAccountingEmails")}</p>
      )}
      {contacts.map((contact, index) => (
        <fieldset className="accounting-contact" key={contact.id}>
          <legend className="sr-only">
            {contact.name || `${t("accountingEmail")} ${index + 1}`}
          </legend>
          <div className="accounting-contact-fields">
            <label>
              {t("accountingContactName")}
              <InfoTip text={t("accountingContactNameTip")} />
              <input
                className="field"
                value={contact.name}
                maxLength={100}
                placeholder={t("accountingContactNamePlaceholder")}
                onChange={(event) =>
                  update(contact.id, { name: event.target.value })
                }
                required
              />
            </label>
            <label>
              {t("email")}
              <InfoTip text={t("accountingContactEmailTip")} />
              <input
                className="field"
                type="email"
                value={contact.email}
                maxLength={254}
                autoComplete="off"
                placeholder="name@example.com"
                onChange={(event) =>
                  update(contact.id, { email: event.target.value })
                }
                required
              />
            </label>
            <button
              className="table-action table-action-danger icon-action accounting-contact-remove"
              type="button"
              aria-label={t("removeAccountingEmail").replace(
                "{name}",
                contact.name || contact.email || String(index + 1),
              )}
              title={t("removeAccountingEmail").replace(
                "{name}",
                contact.name || contact.email || String(index + 1),
              )}
              onClick={() => {
                setMessage("");
                setContacts((current) =>
                  current.filter((item) => item.id !== contact.id),
                );
              }}
            >
              <ActionIcon type="delete" />
            </button>
          </div>
          <div className="access-section accounting-contact-purposes">
            <strong>{t("accountingSendWhen")}</strong>
            {ACCOUNTING_EMAIL_PURPOSES.map((purpose) => (
              <label className="checkbox-row" key={purpose}>
                <input
                  type="checkbox"
                  checked={contact[purpose]}
                  onChange={(event) =>
                    update(contact.id, { [purpose]: event.target.checked })
                  }
                />
                <span>{t(`accountingSend_${purpose}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="actions">
        <button
          className="button secondary"
          type="button"
          disabled={contacts.length >= 20}
          onClick={() => {
            setMessage("");
            setContacts((current) => [...current, newContact()]);
          }}
        >
          {t("addAccountingEmail")}
        </button>
        <button className="button" disabled={busy}>
          {busy ? t("saving") : t("saveChanges")}
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
