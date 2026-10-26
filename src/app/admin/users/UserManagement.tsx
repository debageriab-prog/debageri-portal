"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { appCheckFetch } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";
import type { DocumentAccess, FinanceAccess } from "@/domain/types";
import type { EmailPreferences } from "@/domain/notifications";
import { ActionIcon } from "@/components/ui/ActionIcon";

export interface ManagedUser {
  id: string;
  displayName: string;
  email: string;
  employeeNumber: string;
  role: string;
  reportsTime: boolean;
  status: string;
  createdAt: number;
  employmentStartDate: string;
  employmentEndDate: string;
  reportingStartDate: string;
  financeAccess: FinanceAccess;
  documentAccess: DocumentAccess;
  emailPreferences: EmailPreferences;
}

export function UserManagement({
  users,
  currentUserId,
  saved,
}: {
  users: ManagedUser[];
  currentUserId: string;
  saved: "created" | "updated" | null;
}) {
  const router = useRouter();
  const { t } = useLocale();
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [changingPassword, setChangingPassword] = useState<ManagedUser | null>(
    null,
  );
  const [resettingMfa, setResettingMfa] = useState<ManagedUser | null>(null);
  const [message, setMessage] = useState(
    saved === "created"
      ? t("employeeCreated")
      : saved === "updated"
        ? t("employeeUpdated")
        : "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  function showSuccess(value: string) {
    setError("");
    setMessage(value);
    window.setTimeout(() => setMessage(""), 4500);
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch(
        `/api/admin/users/${encodeURIComponent(deleting.id)}`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirmation: deleteConfirmation }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        return setError(
          result.error ??
            "The employee could not be deleted. Please try again.",
        );
      setDeleting(null);
      showSuccess("Employee deleted.");
      router.refresh();
    } catch {
      setError(
        "We could not reach the server. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeUserPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changingPassword) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    if (password !== String(form.get("confirmation"))) {
      setError("The new passwords do not match.");
      setBusy(false);
      return;
    }
    try {
      const response = await appCheckFetch(
        `/api/admin/users/${encodeURIComponent(changingPassword.id)}/password`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        return setError(
          result.error ??
            "The password could not be changed. Please try again.",
        );
      setChangingPassword(null);
      showSuccess(
        `Password changed for ${changingPassword.displayName}. Their existing sessions were signed out.`,
      );
    } catch {
      setError(
        "We could not reach the server. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function resetMfa() {
    if (!resettingMfa) return;
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch(
        `/api/admin/users/${encodeURIComponent(resettingMfa.id)}/mfa`,
        { method: "DELETE" },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) return setError(result.error ?? t("mfaResetFailed"));
      setResettingMfa(null);
      showSuccess(
        t("mfaResetDone").replace("{name}", resettingMfa.displayName),
      );
    } catch {
      setError(t("mfaResetFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("admin")}</div>
          <h1>{t("employees")}</h1>
          <p className="muted page-description">
            {t("employeesPageDescription")}
          </p>
        </div>
        <Link className="button" href="/admin/users/new">
          <span aria-hidden="true">＋</span> {t("addEmployee")}
        </Link>
      </div>

      {message && (
        <div className="toast toast-success" role="status">
          <span className="toast-icon">✓</span>
          <span>{message}</span>
          <button aria-label="Dismiss" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}

      <section className="card table-wrap">
        {users.length === 0 ? (
          <div className="empty-state">
            <span>{t("people")}</span>
            <h2>{t("noEmployees")}</h2>
            <p>{t("noEmployeesDescription")}</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("name")}</th>
                <th>{t("email")}</th>
                <th>{t("number")}</th>
                <th>{t("role")}</th>
                <th>{t("status")}</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.displayName}</strong>
                    {user.id === currentUserId && (
                      <span className="self-label">{t("you")}</span>
                    )}
                  </td>
                  <td>{user.email}</td>
                  <td>{user.employeeNumber}</td>
                  <td className="capitalize">{user.role}</td>
                  <td>
                    <span className={`status status-${user.status}`}>
                      {user.status}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link
                        className="table-action icon-action"
                        aria-label={t("edit")}
                        title={t("edit")}
                        href={`/admin/users/${encodeURIComponent(user.id)}/edit`}
                      >
                        <ActionIcon type="edit" />
                      </Link>
                      <button
                        className="table-action icon-action"
                        aria-label={t("password")}
                        disabled={user.id === currentUserId}
                        title={t("changePassword")}
                        onClick={() => {
                          setError("");
                          setChangingPassword(user);
                        }}
                      >
                        <ActionIcon type="password" />
                      </button>
                      <button
                        className="table-action icon-action"
                        aria-label={t("mfaReset")}
                        disabled={user.id === currentUserId}
                        title={t("mfaReset")}
                        onClick={() => {
                          setError("");
                          setResettingMfa(user);
                        }}
                      >
                        <ActionIcon type="mfa" />
                      </button>
                      <button
                        className="table-action table-action-danger icon-action"
                        aria-label={t("delete")}
                        disabled={user.id === currentUserId}
                        title={t("deleteEmployee")}
                        onClick={() => {
                          setError("");
                          setDeleteConfirmation("");
                          setDeleting(user);
                        }}
                      >
                        <ActionIcon type="delete" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {deleting && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-employee-title"
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow danger-text">
                  {t("permanentAction")}
                </span>
                <h2 id="delete-employee-title">
                  Delete {deleting.displayName}?
                </h2>
                <p>{t("deleteEmployeeDescription")}</p>
              </div>
            </header>
            {error && (
              <p className="notice notice-error" role="alert">
                {error}
              </p>
            )}
            <label>
              {t("typeConfirmation")} <strong>I am sure</strong>
              <input
                className="field"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                autoComplete="off"
                autoFocus
              />
            </label>
            <footer className="modal-actions">
              <button
                className="button secondary"
                onClick={() => {
                  setDeleting(null);
                  setDeleteConfirmation("");
                }}
              >
                {t("keepEmployee")}
              </button>
              <button
                className="button danger"
                disabled={busy || deleteConfirmation !== "I am sure"}
                onClick={remove}
              >
                {busy ? t("deleting") : t("deleteEmployee")}
              </button>
            </footer>
          </section>
        </div>
      )}

      {changingPassword && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal modal-small"
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-employee-password-title"
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow">{t("accountSecurity")}</span>
                <h2 id="change-employee-password-title">
                  Change password for {changingPassword.displayName}
                </h2>
                <p>{t("adminPasswordDescription")}</p>
              </div>
              <button
                className="modal-close"
                aria-label={t("close")}
                onClick={() => setChangingPassword(null)}
              >
                ×
              </button>
            </header>
            <form onSubmit={changeUserPassword}>
              <div className="account-form">
                <label>
                  {t("newPassword")}
                  <input
                    className="field"
                    name="password"
                    type="password"
                    minLength={8}
                    autoComplete="new-password"
                    autoFocus
                    required
                  />
                </label>
                <label>
                  {t("confirmNewPassword")}
                  <input
                    className="field"
                    name="confirmation"
                    type="password"
                    minLength={8}
                    autoComplete="new-password"
                    required
                  />
                </label>
              </div>
              {error && (
                <p className="notice notice-error" role="alert">
                  {error}
                </p>
              )}
              <footer className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setChangingPassword(null)}
                >
                  {t("cancel")}
                </button>
                <button className="button" disabled={busy}>
                  {busy ? t("changing") : t("changePassword")}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {resettingMfa && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-mfa-title"
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow">{t("accountSecurity")}</span>
                <h2 id="reset-mfa-title">
                  {t("mfaResetTitle").replace(
                    "{name}",
                    resettingMfa.displayName,
                  )}
                </h2>
                <p>{t("mfaResetDescription")}</p>
              </div>
              <button
                className="modal-close"
                aria-label={t("close")}
                onClick={() => setResettingMfa(null)}
              >
                ×
              </button>
            </header>
            {error && (
              <p className="notice notice-error" role="alert">
                {error}
              </p>
            )}
            <footer className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setResettingMfa(null)}
              >
                {t("cancel")}
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={resetMfa}
              >
                {busy ? t("resetting") : t("mfaReset")}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
