"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { EmployeeForm } from "./EmployeeForm";
import { appCheckFetch } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";
import type { DocumentAccess, FinanceAccess } from "@/domain/types";
import {
  NOTIFICATION_TOPICS,
  type EmailPreferences,
} from "@/domain/notifications";
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
}: {
  users: ManagedUser[];
  currentUserId: string;
}) {
  const router = useRouter();
  const { t } = useLocale();
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [changingPassword, setChangingPassword] = useState<ManagedUser | null>(
    null,
  );
  const [resettingMfa, setResettingMfa] = useState<ManagedUser | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editFinanceAccess, setEditFinanceAccess] = useState<FinanceAccess>({
    enabled: false,
    myFinance: false,
    myInvoices: false,
  });
  const [editEmailPreferences, setEditEmailPreferences] =
    useState<EmailPreferences>({
      receipts: true,
      payslips: true,
      timesheets: true,
    });
  const [editDocumentAccess, setEditDocumentAccess] = useState<DocumentAccess>({
    contracts: false,
    payslips: false,
    receipts: false,
  });

  function showSuccess(value: string) {
    setError("");
    setMessage(value);
    window.setTimeout(() => setMessage(""), 4500);
  }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await appCheckFetch(
        `/api/admin/users/${encodeURIComponent(editing.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            displayName: form.get("displayName"),
            email: form.get("email"),
            employeeNumber:
              form.get("employeeNumber") ?? editing.employeeNumber,
            role: editRole,
            reportsTime:
              editRole === "consultant" ||
              (editRole === "manager" && form.get("reportsTime") === "on"),
            status: form.get("status") ?? editing.status,
            employmentStartDate:
              (form.get("employmentStartDate") ??
                editing.employmentStartDate) ||
              null,
            employmentEndDate:
              (form.get("employmentEndDate") ?? editing.employmentEndDate) ||
              null,
            reportingStartDate: editing.reportsTime
              ? form.get("reportingStartDate")
              : null,
            financeAccess:
              editRole === "consultant"
                ? editFinanceAccess
                : { enabled: false, myFinance: false, myInvoices: false },
            documentAccess: {
              contracts:
                editRole === "consultant" && editDocumentAccess.contracts,
              payslips:
                ["consultant", "manager"].includes(editRole) &&
                editDocumentAccess.payslips,
              receipts:
                ["consultant", "manager"].includes(editRole) &&
                editDocumentAccess.receipts,
            },
            emailPreferences: editEmailPreferences,
          }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        return setError(
          result.error ??
            "The employee could not be updated. Please try again.",
        );
      setEditing(null);
      showSuccess("Employee details updated.");
      router.refresh();
    } catch {
      setError(
        "We could not reach the server. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
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
        <EmployeeForm onCreated={showSuccess} />
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
                      <button
                        className="table-action icon-action"
                        aria-label={t("edit")}
                        title={t("edit")}
                        onClick={() => {
                          setError("");
                          setEditing(user);
                          setEditRole(user.role);
                          setEditFinanceAccess(user.financeAccess);
                          setEditDocumentAccess(user.documentAccess);
                          setEditEmailPreferences(user.emailPreferences);
                        }}
                      >
                        <ActionIcon type="edit" />
                      </button>
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

      {editing && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-employee-title"
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow">{t("employeeAccess")}</span>
                <h2 id="edit-employee-title">{t("editEmployee")}</h2>
                <p>{t("editEmployeeDescription")}</p>
              </div>
              <button
                className="modal-close"
                aria-label={t("close")}
                onClick={() => setEditing(null)}
              >
                ×
              </button>
            </header>
            <form onSubmit={update}>
              <div className="form-grid">
                <label>
                  {t("fullName")}
                  <input
                    className="field"
                    name="displayName"
                    defaultValue={editing.displayName}
                    autoFocus
                    required
                  />
                </label>
                <label>
                  {t("workEmail")}
                  <input
                    className="field"
                    name="email"
                    type="email"
                    defaultValue={editing.email}
                    required
                  />
                </label>
                <label>
                  {t("employeeNumber")}
                  <input
                    className="field"
                    name="employeeNumber"
                    defaultValue={editing.employeeNumber}
                    required
                    disabled={editing.id === currentUserId}
                  />
                </label>
                <label>
                  {t("role")}
                  <select
                    className="field"
                    name="role"
                    value={editRole}
                    onChange={(event) => {
                      const nextRole = event.target.value;
                      setEditRole(nextRole);
                      setEditDocumentAccess((current) => ({
                        contracts:
                          nextRole === "consultant" && current.contracts,
                        payslips:
                          ["consultant", "manager"].includes(nextRole) &&
                          current.payslips,
                        receipts:
                          ["consultant", "manager"].includes(nextRole) &&
                          current.receipts,
                      }));
                      if (nextRole !== "consultant")
                        setEditFinanceAccess({
                          enabled: false,
                          myFinance: false,
                          myInvoices: false,
                        });
                    }}
                    disabled={editing.id === currentUserId}
                  >
                    <option value="consultant">{t("consultant")}</option>
                    <option value="manager">{t("manager")}</option>
                    <option value="accountant">{t("accountant")}</option>
                    <option value="admin">{t("administrator")}</option>
                  </select>
                </label>
                {editRole === "manager" && (
                  <label className="checkbox-row form-wide">
                    <input
                      name="reportsTime"
                      type="checkbox"
                      defaultChecked={editing.reportsTime}
                      disabled={editing.id === currentUserId}
                    />
                    <span>
                      <strong>{t("reportsTime")}</strong>
                      <small>{t("managerAccessHelp")}</small>
                    </span>
                  </label>
                )}
                {editRole === "consultant" && (
                  <fieldset className="access-section form-wide">
                    <legend>{t("access")}</legend>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={editFinanceAccess.enabled}
                        onChange={(event) =>
                          setEditFinanceAccess({
                            enabled: event.target.checked,
                            myFinance: event.target.checked,
                            myInvoices: event.target.checked,
                          })
                        }
                      />
                      <span>
                        <strong>{t("finance")}</strong>
                      </span>
                    </label>
                    <div className="access-children">
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={editFinanceAccess.myFinance}
                          disabled={!editFinanceAccess.enabled}
                          onChange={(event) =>
                            setEditFinanceAccess((current) => ({
                              ...current,
                              enabled:
                                event.target.checked || current.myInvoices,
                              myFinance: event.target.checked,
                            }))
                          }
                        />
                        <span>
                          <strong>{t("myFinanceAccess")}</strong>
                        </span>
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={editFinanceAccess.myInvoices}
                          disabled={!editFinanceAccess.enabled}
                          onChange={(event) =>
                            setEditFinanceAccess((current) => ({
                              ...current,
                              enabled:
                                current.myFinance || event.target.checked,
                              myInvoices: event.target.checked,
                            }))
                          }
                        />
                        <span>
                          <strong>{t("myInvoices")}</strong>
                        </span>
                      </label>
                    </div>
                  </fieldset>
                )}
                {(editRole === "consultant" || editRole === "manager") && (
                  <fieldset className="access-section form-wide">
                    <legend>{t("documents")}</legend>
                    {editRole === "consultant" && (
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={editDocumentAccess.contracts}
                          onChange={(event) =>
                            setEditDocumentAccess((current) => ({
                              ...current,
                              contracts: event.target.checked,
                            }))
                          }
                        />
                        <span>
                          <strong>{t("contractsAccess")}</strong>
                        </span>
                      </label>
                    )}
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={editDocumentAccess.payslips}
                        onChange={(event) =>
                          setEditDocumentAccess((current) => ({
                            ...current,
                            payslips: event.target.checked,
                          }))
                        }
                      />
                      <span>
                        <strong>{t("payslipsAccess")}</strong>
                      </span>
                    </label>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={editDocumentAccess.receipts}
                        onChange={(event) =>
                          setEditDocumentAccess((current) => ({
                            ...current,
                            receipts: event.target.checked,
                          }))
                        }
                      />
                      <span>
                        <strong>{t("receiptsAccess")}</strong>
                      </span>
                    </label>
                  </fieldset>
                )}
                <fieldset className="access-section form-wide">
                  <legend>{t("emailNotificationSettings")}</legend>
                  {NOTIFICATION_TOPICS.map((topic) => (
                    <label className="checkbox-row" key={topic}>
                      <input
                        type="checkbox"
                        checked={editEmailPreferences[topic]}
                        onChange={(event) =>
                          setEditEmailPreferences((current) => ({
                            ...current,
                            [topic]: event.target.checked,
                          }))
                        }
                      />
                      <span>
                        <strong>{t(`notificationTopic_${topic}`)}</strong>
                        <small>{t(`emailPreferenceHelp_${topic}`)}</small>
                      </span>
                    </label>
                  ))}
                  <small className="muted">
                    {t("emailPreferencesReminderAlways")}
                  </small>
                </fieldset>
                <label className="form-wide">
                  {t("accountStatus")}
                  <select
                    className="field"
                    name="status"
                    defaultValue={editing.status}
                    disabled={editing.id === currentUserId}
                  >
                    <option value="active">{t("active")}</option>
                    <option value="inactive">{t("inactive")}</option>
                  </select>
                  <small>{t("inactiveAccountHelp")}</small>
                </label>
                <label>
                  {t("employmentStartDate")}
                  <input
                    className="field"
                    name="employmentStartDate"
                    type="date"
                    defaultValue={editing.employmentStartDate}
                    disabled={editing.id === currentUserId}
                    required
                  />
                </label>
                <label>
                  {t("employmentEndDate")}
                  <input
                    className="field"
                    name="employmentEndDate"
                    type="date"
                    defaultValue={editing.employmentEndDate}
                    disabled={editing.id === currentUserId}
                  />
                </label>
                {editing.reportsTime && (
                  <label className="form-wide">
                    {t("reportingStartDate")}
                    <input
                      className="field"
                      name="reportingStartDate"
                      type="date"
                      defaultValue={editing.reportingStartDate}
                      disabled={editing.id === currentUserId}
                      required
                    />
                  </label>
                )}
                {editing.id === currentUserId && (
                  <p className="notice form-wide">{t("ownAccountEditHelp")}</p>
                )}
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
                  onClick={() => setEditing(null)}
                >
                  {t("cancel")}
                </button>
                <button className="button" disabled={busy}>
                  {busy ? t("saving") : t("saveChanges")}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

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
