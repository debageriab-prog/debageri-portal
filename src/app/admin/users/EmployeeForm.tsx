"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { appCheckFetch } from "@/lib/firebase/client";

export function EmployeeForm({
  onCreated,
}: {
  onCreated: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError("");
    const form = new FormData(formElement);
    try {
      const response = await appCheckFetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: form.get("displayName"),
          email: form.get("email"),
          employeeNumber: form.get("employeeNumber"),
          password: form.get("password"),
          weeklyHours: Number(form.get("weeklyHours")),
          employmentStartDate: form.get("employmentStartDate"),
          reportingStartDate: form.get("reportingStartDate"),
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        return setError(
          result.error ??
            "The employee could not be created. Please try again.",
        );
      formElement.reset();
      setOpen(false);
      onCreated("Employee created successfully.");
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
      <button className="button" onClick={() => setOpen(true)}>
        <span aria-hidden="true">＋</span> Add employee
      </button>
      {open && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-employee-title"
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow">New team member</span>
                <h2 id="new-employee-title">Add an employee</h2>
                <p>
                  Create secure portal access and set the employee&apos;s
                  standard working week.
                </p>
              </div>
              <button
                className="modal-close"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </header>
            <form onSubmit={submit}>
              <div className="form-grid">
                <label>
                  Full name
                  <input
                    className="field"
                    name="displayName"
                    placeholder="e.g. Anna Andersson"
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
                    placeholder="anna@debageri.se"
                    required
                  />
                </label>
                <label>
                  Employee number
                  <input
                    className="field"
                    name="employeeNumber"
                    placeholder="DB-006"
                    required
                  />
                </label>
                <label>
                  Weekly hours
                  <input
                    className="field"
                    name="weeklyHours"
                    type="number"
                    min="1"
                    max="168"
                    step=".25"
                    placeholder="40"
                    required
                  />
                </label>
                <label>
                  Employment start date
                  <input
                    className="field"
                    name="employmentStartDate"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </label>
                <label>
                  Time reporting start date
                  <input
                    className="field"
                    name="reportingStartDate"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                  />
                  <small>
                    The first date from which this employee is expected to
                    submit time.
                  </small>
                </label>
                <label className="form-wide">
                  Temporary password
                  <input
                    className="field"
                    name="password"
                    type="password"
                    minLength={8}
                    placeholder="At least 8 characters"
                    required
                  />
                  <small>
                    Share this securely. The employee uses it for their first
                    sign-in.
                  </small>
                </label>
              </div>
              {error && (
                <p className="notice" role="alert">
                  {error}
                </p>
              )}
              <footer className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button className="button" disabled={busy}>
                  {busy ? "Creating…" : "Create employee"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
