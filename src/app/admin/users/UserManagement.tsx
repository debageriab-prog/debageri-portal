"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { EmployeeForm } from "./EmployeeForm";

export interface ManagedUser {
  id: string;
  displayName: string;
  email: string;
  employeeNumber: string;
  role: string;
  status: string;
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
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(editing.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            displayName: form.get("displayName"),
            email: form.get("email"),
            employeeNumber: form.get("employeeNumber"),
            role: form.get("role"),
            status: form.get("status"),
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
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(deleting.id)}`,
        { method: "DELETE" },
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
                        className="table-action table-action-danger"
                        disabled={user.id === currentUserId}
                        title={
                          user.id === currentUserId
                            ? "You cannot delete your own account"
                            : "Delete employee"
                        }
                        onClick={() => {
                          setError("");
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
                  />
                </label>
                <label>
                  Role
                  <select
                    className="field"
                    name="role"
                    defaultValue={editing.role}
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Administrator</option>
                  </select>
                </label>
                <label className="form-wide">
                  Account status
                  <select
                    className="field"
                    name="status"
                    defaultValue={editing.status}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <small>
                    Inactive accounts cannot sign in until they are reactivated.
                  </small>
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
            <footer className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setDeleting(null)}
              >
                Keep employee
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={remove}
              >
                {busy ? "Deleting..." : "Delete employee"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
