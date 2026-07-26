"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function EmployeeForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: form.get("displayName"),
        email: form.get("email"),
        employeeNumber: form.get("employeeNumber"),
        password: form.get("password"),
        weeklyHours: Number(form.get("weeklyHours")),
      }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setError(result.error);
    event.currentTarget.reset();
    router.refresh();
  }
  return (
    <form className="card" onSubmit={submit}>
      <h2>Add employee</h2>
      <div className="form-grid">
        <label>
          Name
          <input className="field" name="displayName" required />
        </label>
        <label>
          Email
          <input className="field" name="email" type="email" required />
        </label>
        <label>
          Employee number
          <input className="field" name="employeeNumber" required />
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
            required
          />
        </label>
        <label>
          Temporary password
          <input
            className="field"
            name="password"
            type="password"
            minLength={8}
            required
          />
        </label>
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <button className="button" disabled={busy}>
        {busy ? "Creating…" : "Create employee"}
      </button>
    </form>
  );
}
