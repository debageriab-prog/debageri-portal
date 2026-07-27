"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { EmployeeForm } from "./EmployeeForm";
import { appCheckFetch } from "@/lib/firebase/client";

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
}

export function UserManagement({
  users,
  currentUserId,
}: {
  users: ManagedUser[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [changingPassword, setChangingPassword] = useState<ManagedUser | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

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
            role: form.get("role") ?? editing.role,
            reportsTime:
              (form.get("role") ?? editing.role) === "consultant" ||
              ((form.get("role") ?? editing.role) === "manager" &&
                form.get("reportsTime") === "on"),
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

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Admin</div>
          <h1>Employees</h1>
          <p className="muted page-description">
            Add team members, update their access and manage who can use the
            employee portal.
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
            <span>People</span>
            <h2>No employees yet</h2>
            <p>Add your first team member to give them access to the portal.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Number</th>
                <th>Role</th>
                <th>Status</th>
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
                      <span className="self-label">You</span>
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
                        className="table-action"
                        onClick={() => {
                          setError("");
                          setEditing(user);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="table-action"
                        disabled={user.id === currentUserId}
                        title={
                          user.id === currentUserId
                            ? "Change your password from the account menu"
                            : "Change employee password"
                        }
                        onClick={() => {
                          setError("");
                          setChangingPassword(user);
                        }}
                      >
                        Password
                      </button>
                      <button
                        className="table-action table-action-danger"
                        disabled={user.id === currentUserId}
                        title={
                          user.id === currentUserId
                            ? "You cannot delete your own account"
                            : "Delete employee"
                        }
                        onClick={() => {
                          setError("");
                          setDeleteConfirmation("");
                          setDeleting(user);
                        }}
                      >
                        Delete
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
                <span className="eyebrow">Employee access</span>
                <h2 id="edit-employee-title">Edit employee</h2>
                <p>
                  Update personal details, portal permissions and account
                  availability.
                </p>
              </div>
              <button
                className="modal-close"
                aria-label="Close"
                onClick={() => setEditing(null)}
              >
                ×
              </button>
            </header>
            <form onSubmit={update}>
              <div className="form-grid">
                <label>
                  Full name
                  <input
                    className="field"
                    name="displayName"
                    defaultValue={editing.displayName}
                    autoFocus
                    required
                  />
                </label>
                <label>
                  Work email
                  <input
                    className="field"
                    name="email"
                    type="email"
                    defaultValue={editing.email}
                    required
                  />
                </label>
                <label>
                  Employee number
                  <input
                    className="field"
                    name="employeeNumber"
                    defaultValue={editing.employeeNumber}
                    required
                    disabled={editing.id === currentUserId}
                  />
                </label>
                <label>
                  Role
                  <select
                    className="field"
                    name="role"
                    defaultValue={editing.role}
                    disabled={editing.id === currentUserId}
                  >
                    <option value="consultant">Consultant</option>
                    <option value="manager">Manager</option>
                    <option value="accountant">Accountant</option>
                    <option value="admin">Administrator</option>
                  </select>
                </label>
                {editing.role === "manager" && (
                  <label className="checkbox-row form-wide">
                    <input
                      name="reportsTime"
                      type="checkbox"
                      defaultChecked={editing.reportsTime}
                      disabled={editing.id === currentUserId}
                    />
                    <span>
                      <strong>Reports time</strong>
                      <small>
                        Gives this manager access to Timesheet and History.
                      </small>
                    </span>
                  </label>
                )}
                <label className="form-wide">
                  Account status
                  <select
                    className="field"
                    name="status"
                    defaultValue={editing.status}
                    disabled={editing.id === currentUserId}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <small>
                    Inactive accounts cannot sign in until they are reactivated.
                  </small>
                </label>
                <label>
                  Employment start date
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
                  Employment end date
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
                    Time reporting start date
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
                  <p className="notice form-wide">
                    For your own account, only full name and email can be
                    changed.
                  </p>
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
                  Cancel
                </button>
                <button className="button" disabled={busy}>
                  {busy ? "Saving..." : "Save changes"}
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
                <span className="eyebrow danger-text">Permanent action</span>
                <h2 id="delete-employee-title">
                  Delete {deleting.displayName}?
                </h2>
                <p>
                  Their login and employment terms will be removed. Historical
                  timesheets and audit records will remain.
                </p>
              </div>
            </header>
            {error && (
              <p className="notice notice-error" role="alert">
                {error}
              </p>
            )}
            <label>
              Type <strong>I am sure</strong> to confirm
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
                Keep employee
              </button>
              <button
                className="button danger"
                disabled={busy || deleteConfirmation !== "I am sure"}
                onClick={remove}
              >
                {busy ? "Deleting..." : "Delete employee"}
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
                <span className="eyebrow">Account security</span>
                <h2 id="change-employee-password-title">
                  Change password for {changingPassword.displayName}
                </h2>
                <p>
                  Set a temporary password and share it securely. Their existing
                  sessions will be signed out.
                </p>
              </div>
              <button
                className="modal-close"
                aria-label="Close"
                onClick={() => setChangingPassword(null)}
              >
                ×
              </button>
            </header>
            <form onSubmit={changeUserPassword}>
              <div className="account-form">
                <label>
                  New password
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
                  Confirm new password
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
                  Cancel
                </button>
                <button className="button" disabled={busy}>
                  {busy ? "Changing..." : "Change password"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
