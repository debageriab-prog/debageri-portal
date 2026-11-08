"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { appCheckFetch } from "@/lib/firebase/client";
import type { TaxYearSummary } from "@/domain/salary/tax";

function tableRange(tables: number[]) {
  if (!tables.length) return "—";
  return tables.length === 1
    ? String(tables[0])
    : `${tables[0]}–${tables[tables.length - 1]}`;
}

export function TaxTableImport({
  years,
  currentYear,
}: {
  years: TaxYearSummary[];
  currentYear: number;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [year, setYear] = useState(String(currentYear));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await appCheckFetch("/api/finance/tax-tables", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ year: Number(year) }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        tables?: number;
        municipalities?: number;
      };
      if (!response.ok) {
        setError(
          t(
            result.error === "taxTablesNotPublished"
              ? "taxTablesNotPublished"
              : "taxTablesUnavailable",
          ),
        );
        return;
      }
      setMessage(
        t("taxTablesImported")
          .replace("{year}", year)
          .replace("{tables}", String(result.tables ?? 0))
          .replace("{municipalities}", String(result.municipalities ?? 0)),
      );
      router.refresh();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="card form-card" onSubmit={submit}>
        <h2>{t("importTaxTables")}</h2>
        <p className="muted">{t("taxTablesImportExplanation")}</p>
        <div className="form-grid">
          <label>
            {t("taxYear")}
            <select
              className="field"
              value={year}
              onChange={(event) => setYear(event.target.value)}
            >
              {[currentYear + 1, currentYear, currentYear - 1].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
        {message && <p className="notice notice-success">{message}</p>}
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button className="button" disabled={busy}>
            {busy ? t("importingTaxTables") : t("importFromSkatteverket")}
          </button>
        </footer>
      </form>

      <section className="card">
        <h2>{t("importedTaxYears")}</h2>
        {!years.length ? (
          <p className="muted">{t("noTaxYears")}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("taxYear")}</th>
                  <th>{t("taxTables")}</th>
                  <th>{t("municipalities")}</th>
                  <th>{t("importedAt")}</th>
                </tr>
              </thead>
              <tbody>
                {years.map((item) => (
                  <tr key={item.year}>
                    <td>{item.year}</td>
                    <td>{tableRange(item.tables)}</td>
                    <td>{item.municipalities}</td>
                    <td>
                      {item.importedAt
                        ? new Date(item.importedAt).toLocaleString(locale, {
                            timeZone: "Europe/Stockholm",
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
