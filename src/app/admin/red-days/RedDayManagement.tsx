"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { appCheckFetch } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";

type RedDay = { id: string; date: string; name: string };

export function RedDayManagement({
  days,
  initialYear,
}: {
  days: RedDay[];
  initialYear: number;
}) {
  const router = useRouter();
  const { t } = useLocale();
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
      const response = await appCheckFetch("/api/admin/holidays", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: form.get("date"),
          name: form.get("name"),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return setError(result.error ?? t("addRedDayFailed"));
      formElement.reset();
      router.refresh();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    const response = await appCheckFetch(
      `/api/admin/holidays/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    );
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error ?? t("removeRedDayFailed"));
    } else router.refresh();
    setBusy(false);
  }

  const visible = days.filter((day) => Number(day.date.slice(0, 4)) === year);
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("admin")}</div>
          <h1>{t("redDays")}</h1>
          <p className="muted page-description">
            {t("redDaysPageDescription")}
          </p>
        </div>
        <label>
          {t("year")}
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
            {t("date")}
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
            {t("description")}
            <input
              className="field"
              name="name"
              placeholder={t("redDayExample")}
              required
            />
          </label>
          <div className="form-wide actions">
            <button className="button" disabled={busy}>
              {t("addRedDay")}
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
                <th>{t("date")}</th>
                <th>{t("description")}</th>
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
                      {t("remove")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>
            {t("noRedDays")} {year}.
          </p>
        )}
      </section>
    </>
  );
}
