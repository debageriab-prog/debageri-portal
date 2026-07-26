"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type RedDay = { id: string; date: string; name: string };

export function RedDayManagement({
  days,
  initialYear,
}: {
  days: RedDay[];
  initialYear: number;
}) {
  const router = useRouter();
  const [year, setYear] = useState(initialYear);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/holidays", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: form.get("date"),
          name: form.get("name"),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        return setError(result.error ?? "Could not add red day.");
      formElement.reset();
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    const response = await fetch(
      `/api/admin/holidays/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    );
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error ?? "Could not remove red day.");
    } else router.refresh();
    setBusy(false);
  }

  const visible = days.filter((day) => Number(day.date.slice(0, 4)) === year);
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Admin</div>
          <h1>Red days</h1>
          <p className="muted page-description">
            Add public holidays and organization non-working dates. They reduce
            expected time and warn employees who report hours on those dates.
          </p>
        </div>
        <label>
          Year
          <input
            className="field"
            type="number"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          />
        </label>
      </div>
      <section className="card">
        <form className="form-grid" onSubmit={add}>
          <label>
            Date
            <input
              className="field"
              type="date"
              name="date"
              min={`${year}-01-01`}
              max={`${year}-12-31`}
              required
            />
          </label>
          <label>
            Description
            <input
              className="field"
              name="name"
              placeholder="e.g. Midsummer Day"
              required
            />
          </label>
          <div className="form-wide actions">
            <button className="button" disabled={busy}>
              Add red day
            </button>
          </div>
        </form>
        {error && <p className="notice notice-error">{error}</p>}
      </section>
      <section className="card table-wrap">
        {visible.length ? (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((day) => (
                <tr key={day.id}>
                  <td>{day.date}</td>
                  <td>{day.name}</td>
                  <td>
                    <button
                      className="table-action table-action-danger"
                      disabled={busy}
                      onClick={() => remove(day.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No red days configured for {year}.</p>
        )}
      </section>
    </>
  );
}
