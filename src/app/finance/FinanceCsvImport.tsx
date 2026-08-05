"use client";

import { ChangeEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import {
  invoiceCsvHeaders,
  transactionCsvHeaders,
  transactionExportCsvHeaders,
} from "@/domain/finance/csv";
import { appCheckFetch } from "@/lib/firebase/client";

type Kind = "invoices" | "transactions" | "income" | "expenses";
type Preview = {
  ok: boolean;
  rows: number;
  errors: Array<{ row: number; message: string }>;
};

export function FinanceCsvImport({
  allowedKinds = ["invoices", "income", "expenses"],
}: {
  allowedKinds?: Kind[];
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(allowedKinds[0] ?? "invoices");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setCsv(file ? await file.text() : "");
    setPreview(null);
    setError("");
    setMessage("");
  }

  async function run(commit: boolean) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await appCheckFetch("/api/finance/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, csv, commit }),
      });
      const result = (await response.json().catch(() => ({}))) as Preview & {
        error?: string;
        imported?: number;
        skipped?: number;
      };
      if (!response.ok) {
        const key =
          `financeError_${result.error ?? "importInvalid"}` as Parameters<
            typeof t
          >[0];
        return setError(t(key));
      }
      setPreview(result);
      if (commit) {
        setMessage(
          `${t("importCompleted")} ${result.imported ?? 0}. ${t("importSkipped")} ${result.skipped ?? 0}.`,
        );
        router.refresh();
      }
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const headers =
      kind === "invoices"
        ? invoiceCsvHeaders
        : kind === "transactions"
          ? transactionExportCsvHeaders
          : transactionCsvHeaders;
    const blob = new Blob([`${headers.join(",")}\n`], {
      type: "text/csv;charset=utf-8",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `finance-${kind}-template.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <section className="card">
      <h2>{t("historicalCsvImport")}</h2>
      <p className="muted">{t("csvImportDescription")}</p>
      <div className="form-grid">
        <label>
          {t("importType")}
          <select
            className="field"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as Kind);
              setPreview(null);
            }}
          >
            {allowedKinds.includes("invoices") && (
              <option value="invoices">{t("invoices")}</option>
            )}
            {allowedKinds.includes("income") && (
              <option value="income">{t("income")}</option>
            )}
            {allowedKinds.includes("expenses") && (
              <option value="expenses">{t("expenses")}</option>
            )}
            {allowedKinds.includes("transactions") && (
              <option value="transactions">
                {t("incomeExpenseManagement")}
              </option>
            )}
          </select>
        </label>
        <label>
          {t("csvFile")}
          <input
            className="field"
            type="file"
            accept=".csv,text/csv"
            onChange={chooseFile}
          />
        </label>
      </div>
      <div className="actions">
        <button
          className="button secondary"
          type="button"
          onClick={downloadTemplate}
        >
          {t("downloadTemplate")}
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={busy || !csv}
          onClick={() => void run(false)}
        >
          {t("previewImport")}
        </button>
        <button
          className="button"
          type="button"
          disabled={busy || !preview?.ok}
          onClick={() => void run(true)}
        >
          {t("confirmImport")}
        </button>
      </div>
      {preview && (
        <p className="notice">
          {t("importRowsFound")} {preview.rows}. {t("importErrorsFound")}{" "}
          {preview.errors.length}.
        </p>
      )}
      {preview?.errors.map((item) => (
        <p className="notice notice-error" key={`${item.row}-${item.message}`}>
          {t("row")} {item.row}: {t(item.message as Parameters<typeof t>[0])}
        </p>
      ))}
      {error && <p className="notice notice-error">{error}</p>}
      {message && <p className="notice notice-success">{message}</p>}
    </section>
  );
}
