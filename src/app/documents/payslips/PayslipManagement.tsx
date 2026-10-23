"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { FileDownloadIcon } from "@/components/ui/FileActionIcons";
import { useLocale } from "@/components/localization/LocaleProvider";
import { formatPayslipMonth } from "@/domain/payslips";
import { appCheckFetch } from "@/lib/firebase/client";
import {
  downloadPayslip,
  PayslipPreview,
  type PayslipItem,
} from "./PayslipPreview";

export function PayslipManagement({
  payslips,
  year,
  years,
}: {
  payslips: PayslipItem[];
  year: number;
  years: number[];
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [monthFilter, setMonthFilter] = useState("");
  const [personFilter, setPersonFilter] = useState("");
  const [viewing, setViewing] = useState<PayslipItem | null>(null);
  const [deleting, setDeleting] = useState<PayslipItem | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const people = Array.from(
    new Map(payslips.map((item) => [item.userId, item.userName])),
  ).sort((left, right) => left[1].localeCompare(right[1]));
  const filtered = payslips.filter(
    (item) =>
      (!monthFilter || item.month === Number(monthFilter)) &&
      (!personFilter || item.userId === personFilter),
  );

  async function download(item: PayslipItem) {
    setError("");
    if (!(await downloadPayslip(item))) setError(t("payslipDownloadFailed"));
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    const response = await appCheckFetch(
      `/api/documents/payslips/${encodeURIComponent(deleting.id)}`,
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation }),
      },
    );
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setBusy(false);
    if (!response.ok)
      return setError(
        result.error === "confirmationRequired"
          ? t("contractError_confirmationRequired")
          : t("payslipDeleteFailed"),
      );
    setDeleting(null);
    setConfirmation("");
    router.refresh();
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("documents")}</div>
          <h1>{t("payslips")}</h1>
          <p className="muted page-description">{t("payslipsDescription")}</p>
        </div>
        <Link
          className="button"
          href={`/documents/payslips/upload?year=${year}`}
        >
          {t("uploadPayslips")}
        </Link>
      </div>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      <section className="card filters-card">
        <div className="form-grid">
          <label>
            {t("year")}
            <select
              className="field"
              value={year}
              onChange={(event) =>
                router.push(`/documents/payslips?year=${event.target.value}`)
              }
            >
              {years.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("month")}
            <select
              className="field"
              value={monthFilter}
              onChange={(event) => setMonthFilter(event.target.value)}
            >
              <option value="">{t("allMonths")}</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                <option key={month} value={month}>
                  {formatPayslipMonth(locale, year, month)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("employee")}
            <select
              className="field"
              value={personFilter}
              onChange={(event) => setPersonFilter(event.target.value)}
            >
              <option value="">{t("allEmployees")}</option>
              {people.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section className="card table-wrap">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <h2>{t("noPayslips")}</h2>
            <p>{t("noPayslipsDescription")}</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("payslipMonth")}</th>
                <th>{t("employee")}</th>
                <th>{t("file")}</th>
                <th>{t("uploaded")}</th>
                <th>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>{formatPayslipMonth(locale, item.year, item.month)}</td>
                  <td>
                    <strong>{item.userName}</strong>
                  </td>
                  <td className="payslip-file-name">{item.fileName}</td>
                  <td>{item.uploadedAt}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="table-action icon-action"
                        aria-label={t("viewPayslip")}
                        title={t("viewPayslip")}
                        onClick={() => setViewing(item)}
                      >
                        <span aria-hidden="true">i</span>
                      </button>
                      <button
                        className="table-action icon-action payslip-download-action"
                        aria-label={t("download")}
                        title={t("download")}
                        onClick={() => void download(item)}
                      >
                        <FileDownloadIcon />
                      </button>
                      <button
                        className="table-action table-action-danger icon-action"
                        aria-label={t("delete")}
                        title={t("delete")}
                        onClick={() => {
                          setDeleting(item);
                          setConfirmation("");
                        }}
                      >
                        <ActionIcon type="delete" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {viewing && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setViewing(null)}
        >
          <section
            className="modal payslip-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payslip-view-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow">
                  {formatPayslipMonth(locale, viewing.year, viewing.month)}
                </span>
                <h2 id="payslip-view-title">{viewing.userName}</h2>
                <p>{viewing.fileName}</p>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label={t("close")}
                onClick={() => setViewing(null)}
              >
                ×
              </button>
            </header>
            <PayslipPreview payslip={viewing} />
          </section>
        </div>
      )}
      {deleting && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="payslip-delete-title"
          >
            <header className="modal-header">
              <div>
                <h2 id="payslip-delete-title">{t("deletePayslip")}</h2>
                <p>
                  {t("deletePayslipDescription")
                    .replace("{name}", deleting.userName)
                    .replace(
                      "{month}",
                      formatPayslipMonth(locale, deleting.year, deleting.month),
                    )}
                </p>
              </div>
            </header>
            <label>
              {t("typeDeleteConfirmation").replace(
                "{phrase}",
                t("deleteConfirmationPhrase"),
              )}
              <input
                className="field"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoFocus
              />
            </label>
            <footer className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setDeleting(null)}
              >
                {t("cancel")}
              </button>
              <button
                className="button danger"
                disabled={
                  busy || confirmation !== t("deleteConfirmationPhrase")
                }
                onClick={() => void remove()}
              >
                {busy ? t("deleting") : t("delete")}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
