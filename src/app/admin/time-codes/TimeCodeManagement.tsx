"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export type ManagedTimeCode = {
  id: string;
  code: string;
  name: string;
  category: string;
  hourlyRate: number;
  active: boolean;
  requiresComment: boolean;
  countsAsWorkedTime: boolean;
};

const categories = [
  "work",
  "overtime",
  "vacation",
  "parental_leave",
  "sick_leave",
  "care_leave",
  "unpaid_leave",
  "compensatory_leave",
  "holiday",
  "other",
];

export function TimeCodeManagement({ codes }: { codes: ManagedTimeCode[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ManagedTimeCode | "new" | null>(null);
  const [deleting, setDeleting] = useState<ManagedTimeCode | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const isNew = editing === "new";
      const response = await fetch(
        isNew
          ? "/api/admin/time-codes"
          : `/api/admin/time-codes/${encodeURIComponent(editing.id)}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            code: form.get("code"),
            name: form.get("name"),
            category: form.get("category"),
            hourlyRate: Number(form.get("hourlyRate")),
            active: form.get("active") === "on",
            requiresComment: form.get("requiresComment") === "on",
            countsAsWorkedTime: form.get("countsAsWorkedTime") === "on",
          }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "The time code could not be saved.");
        return;
      }
      setEditing(null);
      setMessage(isNew ? "Time code created." : "Time code updated.");
      router.refresh();
    } catch {
      setError("We could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting || confirmation !== "I am sure") return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/time-codes/${encodeURIComponent(deleting.id)}`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirmation }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "The time code could not be deleted.");
        return;
      }
      setDeleting(null);
      setConfirmation("");
      setMessage("Time code deleted.");
      router.refresh();
    } catch {
      setError("We could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const value = editing === "new" ? null : editing;
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Admin</div>
          <h1>Time codes</h1>
          <p className="muted page-description">
            Add reporting categories, control availability and keep the hourly
            rate used for future invoicing.
          </p>
        </div>
        <button className="button" onClick={() => setEditing("new")}>
          Add time code
        </button>
      </div>
      {message && (
        <div className="toast toast-success" role="status">
          {message}
        </div>
      )}
      <section className="card table-wrap">
        {codes.length === 0 ? (
          <div className="empty-state">
            <h2>No time codes yet</h2>
            <p>Add a time code employees can use in weekly reports.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Hourly rate</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr key={code.id}>
                  <td>{code.code}</td>
                  <td>{code.name}</td>
                  <td className="capitalize">
                    {code.category.replaceAll("_", " ")}
                  </td>
                  <td>{code.hourlyRate.toFixed(2)}</td>
                  <td>{code.active ? "Active" : "Inactive"}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="table-action"
                        onClick={() => setEditing(code)}
                      >
                        Edit
                      </button>
                      <button
                        className="table-action table-action-danger"
                        onClick={() => {
                          setConfirmation("");
                          setError("");
                          setDeleting(code);
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
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true">
            <header className="modal-header">
              <div>
                <span className="eyebrow">Reporting setup</span>
                <h2>
                  {editing === "new" ? "Add time code" : "Edit time code"}
                </h2>
                <p>Define how this code appears and the hourly invoice rate.</p>
              </div>
            </header>
            <form onSubmit={save}>
              <div className="form-grid">
                <label>
                  Code
                  <input
                    className="field"
                    name="code"
                    defaultValue={value?.code}
                    required
                  />
                </label>
                <label>
                  Name
                  <input
                    className="field"
                    name="name"
                    defaultValue={value?.name}
                    required
                  />
                </label>
                <label>
                  Category
                  <select
                    className="field"
                    name="category"
                    defaultValue={value?.category ?? "work"}
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Hourly rate
                  <input
                    className="field"
                    name="hourlyRate"
                    type="number"
                    min="0"
                    step=".01"
                    defaultValue={value?.hourlyRate ?? 0}
                    required
                  />
                </label>
                <label>
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={value?.active ?? true}
                  />{" "}
                  Active
                </label>
                <label>
                  <input
                    name="requiresComment"
                    type="checkbox"
                    defaultChecked={value?.requiresComment ?? false}
                  />{" "}
                  Requires comment
                </label>
                <label>
                  <input
                    name="countsAsWorkedTime"
                    type="checkbox"
                    defaultChecked={value?.countsAsWorkedTime ?? true}
                  />{" "}
                  Counts as worked time
                </label>
              </div>
              {error && <p className="notice notice-error">{error}</p>}
              <footer className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button className="button" disabled={busy}>
                  {busy ? "Saving..." : "Save time code"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
      {deleting && (
        <div className="modal-backdrop">
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow danger-text">Permanent action</span>
                <h2>Delete {deleting.code}?</h2>
                <p>
                  Historical entries keep their snapshot, but employees can no
                  longer select this code.
                </p>
              </div>
            </header>
            <label>
              Type <strong>I am sure</strong> to confirm
              <input
                className="field"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoFocus
              />
            </label>
            {error && <p className="notice notice-error">{error}</p>}
            <footer className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setDeleting(null)}
              >
                Keep time code
              </button>
              <button
                className="button danger"
                disabled={busy || confirmation !== "I am sure"}
                onClick={remove}
              >
                {busy ? "Deleting..." : "Delete time code"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
