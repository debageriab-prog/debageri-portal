"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { createFinanceCsv } from "@/domain/finance/csv";
import { formatSek, formatSekCompact } from "@/domain/finance/calculations";
import {
  balancesAfter,
  percentValue,
  sekValue,
  transactionBackupCsvHeaders,
  transactionBackupRows,
  transactionExportTotals,
  type ExportableTransaction,
} from "@/domain/finance/transaction-export";
import { appCheckFetch } from "@/lib/firebase/client";

type Translate = ReturnType<typeof useLocale>["t"];
type TranslationKey = Parameters<Translate>[0];

type Preview = {
  ok: boolean;
  rows: number;
  duplicates?: number;
  imported?: number;
  skipped?: number;
  errors: Array<{ row: number; message: string }>;
  error?: string;
};

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * The "Import and export" menu on Income and expenses. Every export covers
 * the view as it is filtered: the period, who is shown and the search.
 */
export function TransactionImportExport<T extends ExportableTransaction>({
  transactions,
  scopeTransactions,
  balanceChange,
  categoryName,
  categoryCode,
  consultantName,
  employeeNumber,
  details,
  summary,
  fileStem,
  canExport,
  canImport,
}: {
  /** The rows in the view, newest first, as the table shows them. */
  transactions: T[];
  /** Everything for the same consultant filter, for the running balance. */
  scopeTransactions: T[];
  balanceChange: (transaction: T) => number;
  categoryName: (id: string) => string;
  categoryCode: (id: string) => string;
  consultantName: (id: string | null) => string;
  employeeNumber: (id: string) => string;
  /** What the view is filtered on, one line each. */
  details: string[];
  /** The totals shown above the table, already formatted. */
  summary: Array<{ label: string; value: string }>;
  fileStem: string;
  canExport: boolean;
  canImport: boolean;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !anchorRef.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const balances = () => balancesAfter(scopeTransactions, balanceChange);
  const fundingLabel = (transaction: T) =>
    transaction.funding === "company"
      ? t("companyFunded")
      : transaction.funding === "consultant"
        ? t("consultantFunded")
        : "";

  function exportCsv() {
    const balance = balances();
    const columns: Array<[TranslationKey, (transaction: T) => string]> = [
      ["date", (item) => item.date],
      ["type", (item) => t(item.direction)],
      ["category", (item) => categoryName(item.categoryId)],
      ["consultant", (item) => consultantName(item.consultantId)],
      ["description", (item) => item.visibleDescription],
      ["funding", fundingLabel],
      ["netAmount", (item) => sekValue(item.netMinor)],
      ["vatPercent", (item) => percentValue(item.vatRateBps)],
      ["vatAmount", (item) => sekValue(item.vatMinor)],
      ["exportRounding", (item) => sekValue(item.roundingMinor)],
      ["totalIncludingVat", (item) => sekValue(item.grossMinor)],
      ["balanceChange", (item) => sekValue(balanceChange(item))],
      ["exportBalanceAfter", (item) => sekValue(balance.get(item.id) ?? 0)],
      ["internalNote", (item) => item.internalNote],
    ];
    const headers = columns.map(([key]) => t(key));
    const csv = createFinanceCsv(
      headers,
      transactions.map((transaction) =>
        Object.fromEntries(
          columns.map(([key, read]) => [t(key), read(transaction)]),
        ),
      ),
    );
    download(
      new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }),
      `${fileStem}.csv`,
    );
  }

  function exportBackupCsv() {
    const csv = createFinanceCsv(
      transactionBackupCsvHeaders,
      transactionBackupRows(transactions, { employeeNumber, categoryCode }),
    );
    download(
      new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }),
      `${fileStem}-backup.csv`,
    );
  }

  async function exportPdf() {
    setBusy(true);
    setError("");
    try {
      const balance = balances();
      const totals = transactionExportTotals(transactions, balanceChange);
      const sek = (minor: number) => formatSek(minor, locale);
      // Totals read like the ones above the table, rows keep their öre.
      const total = (minor: number) => formatSekCompact(minor, locale);
      // The balance at the end of the view is the one after its newest row.
      const newest = [...transactions].sort(
        (left, right) =>
          right.date.localeCompare(left.date) ||
          right.createdAt - left.createdAt,
      )[0];
      const closing = newest ? (balance.get(newest.id) ?? 0) : 0;
      const response = await appCheckFetch("/api/finance/transactions/pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fileName: `${fileStem}.pdf`,
          title: t("incomeExpenseManagement"),
          details: [
            ...details,
            `${t("exportGenerated")}: ${new Date().toLocaleString(locale)}`,
          ],
          totals: [
            ...summary,
            {
              label: t("exportResultNet"),
              value: total(totals.resultNetMinor),
            },
            { label: t("exportVatNet"), value: total(totals.vatNetMinor) },
            {
              label: t("exportTotalBalanceChange"),
              value: total(totals.balanceChangeMinor),
            },
            { label: t("exportClosingBalance"), value: total(closing) },
            { label: t("exportTransactionCount"), value: String(totals.count) },
          ],
          columns: [
            { label: t("date"), align: "left", width: 1.3 },
            { label: t("type"), align: "left", width: 1 },
            { label: t("category"), align: "left", width: 2 },
            { label: t("consultant"), align: "left", width: 1.8 },
            { label: t("description"), align: "left", width: 2.7 },
            { label: t("netAmount"), align: "right", width: 1.4 },
            { label: t("vatAmount"), align: "right", width: 1.2 },
            { label: t("totalIncludingVat"), align: "right", width: 1.7 },
            { label: t("balanceChange"), align: "right", width: 1.4 },
            { label: t("exportBalanceAfter"), align: "right", width: 1.4 },
          ],
          rows: transactions.map((item) => [
            item.date,
            t(item.direction),
            categoryName(item.categoryId),
            consultantName(item.consultantId),
            item.visibleDescription,
            sek(item.netMinor),
            sek(item.vatMinor),
            sek(item.grossMinor),
            sek(balanceChange(item)),
            sek(balance.get(item.id) ?? 0),
          ]),
          pageLabel: t("exportPageOf"),
          emptyLabel: t("exportNoTransactions"),
        }),
      });
      if (!response.ok) return setError(t("exportFailed"));
      download(await response.blob(), `${fileStem}.pdf`);
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  function choose(action: () => void | Promise<void>) {
    setOpen(false);
    setMessage("");
    setError("");
    void action();
  }

  return (
    <>
      <div className="more-anchor" ref={anchorRef}>
        <button
          className="button secondary menu-button"
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={busy}
          onClick={() => setOpen((value) => !value)}
        >
          {t("importExport")}
          <ActionIcon type="more" />
        </button>
        {open && (
          <div className="more-menu" role="menu">
            {canExport && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => choose(exportCsv)}
                >
                  {t("exportCsv")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => choose(exportPdf)}
                >
                  {t("exportPdf")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => choose(exportBackupCsv)}
                >
                  {t("exportBackupCsv")}
                </button>
              </>
            )}
            {canImport && (
              <button
                type="button"
                role="menuitem"
                onClick={() => choose(() => setImporting(true))}
              >
                {t("importPortalBackup")}
              </button>
            )}
          </div>
        )}
      </div>
      {(error || message) && (
        <p
          className={`notice ${error ? "notice-error" : "notice-success"} import-export-notice`}
          role={error ? "alert" : "status"}
        >
          {error || message}
        </p>
      )}
      {importing && (
        <BackupImportModal
          onClose={() => setImporting(false)}
          onImported={(result) => {
            setImporting(false);
            setMessage(
              t("backupImportDone")
                .replace("{added}", String(result.imported ?? 0))
                .replace("{skipped}", String(result.skipped ?? 0)),
            );
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function BackupImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (result: Preview) => void;
}) {
  const { t } = useLocale();
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(source: string, commit: boolean) {
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch("/api/finance/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "transactions", csv: source, commit }),
      });
      const result = (await response.json().catch(() => ({}))) as Preview;
      if (!response.ok) {
        setPreview(null);
        setError(
          t(
            `financeError_${result.error ?? "importInvalid"}` as TranslationKey,
          ),
        );
        return;
      }
      if (commit) onImported(result);
      else setPreview(result);
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const source = file ? await file.text() : "";
    setCsv(source);
    setPreview(null);
    setError("");
    if (source) await send(source, false);
  }

  const duplicates = preview?.duplicates ?? 0;
  const newRows = preview ? preview.rows - duplicates : 0;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal modal-small"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-import-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2 id="backup-import-title">{t("importPortalBackup")}</h2>
            <p>{t("backupImportDescription")}</p>
          </div>
          <button
            className="modal-close"
            type="button"
            aria-label={t("close")}
            onClick={onClose}
          >
            {"×"}
          </button>
        </header>
        <div className="backup-import-body">
          <label>
            {t("csvFile")}
            <input
              className="field"
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(event) => void chooseFile(event)}
            />
          </label>
          {busy && !preview && (
            <p className="muted">{t("backupImportChecking")}</p>
          )}
          {preview && (
            <p className={`notice${preview.ok ? "" : " notice-warning"}`}>
              {t("backupImportPreview")
                .replace("{rows}", String(preview.rows))
                .replace("{new}", String(newRows))
                .replace("{duplicates}", String(duplicates))}
            </p>
          )}
          {preview?.errors.map((item) => (
            <p
              className="notice notice-error"
              key={`${item.row}-${item.message}`}
            >
              {t("row")} {item.row}: {t(item.message as TranslationKey)}
            </p>
          ))}
          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            {t("cancel")}
          </button>
          <button
            className="button"
            type="button"
            disabled={busy || !csv || !preview?.ok || newRows === 0}
            onClick={() => void send(csv, true)}
          >
            {busy && preview
              ? t("saving")
              : t("backupImportConfirm").replace("{count}", String(newRows))}
          </button>
        </footer>
      </section>
    </div>
  );
}
