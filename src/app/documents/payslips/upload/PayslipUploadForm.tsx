"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { FileRemoveIcon } from "@/components/ui/FileActionIcons";
import {
  formatPayslipMonth,
  isPayslipContentType,
  matchPayslipRecipient,
  PAYSLIP_MAX_BYTES,
} from "@/domain/payslips";
import { appCheckFetch } from "@/lib/firebase/client";
import type { MessageKey } from "@/lib/localization/messages";

export type PayslipRecipient = {
  id: string;
  name: string;
  employeeNumber: string;
  role: string;
  hasAccess: boolean;
};

type Row = {
  key: string;
  file: File;
  userId: string;
  state: "pending" | "uploading" | "done" | "error";
  error?: string;
};

const uploadErrors: Record<string, MessageKey> = {
  invalidInput: "payslipError_invalidInput",
  invalidRecipient: "payslipError_invalidRecipient",
  payslipExists: "payslipError_payslipExists",
  payslipFileRequired: "payslipError_payslipFileRequired",
  payslipFileTooLarge: "payslipError_payslipFileTooLarge",
  payslipFileType: "payslipError_payslipFileType",
};

export function PayslipUploadForm({
  recipients,
  defaultYear,
  defaultMonth,
}: {
  recipients: PayslipRecipient[];
  defaultYear: number;
  defaultMonth: number;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const recipientById = new Map(recipients.map((item) => [item.id, item]));
  const pending = rows.filter((row) => row.state !== "done");
  const duplicates = new Set(
    pending
      .map((row) => row.userId)
      .filter(
        (id, index, ids) => id && ids.indexOf(id) !== ids.lastIndexOf(id),
      ),
  );

  function addFiles(files: File[]) {
    setError("");
    const invalid = files.filter(
      (file) =>
        !isPayslipContentType(file.type) || file.size > PAYSLIP_MAX_BYTES,
    );
    if (invalid.length)
      setError(
        t("payslipFilesSkipped").replace(
          "{names}",
          invalid.map((file) => file.name).join(", "),
        ),
      );
    setRows((current) => [
      ...current,
      ...files
        .filter((file) => !invalid.includes(file))
        .map((file) => ({
          key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
          file,
          userId: matchPayslipRecipient(file.name, recipients) ?? "",
          state: "pending" as const,
        })),
    ]);
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!pending.length) return setError(t("payslipError_payslipFileRequired"));
    if (pending.some((row) => !row.userId))
      return setError(t("payslipSelectAllRecipients"));
    if (duplicates.size) return setError(t("payslipDuplicateRecipients"));
    setBusy(true);
    let failures = 0;
    for (const row of pending) {
      updateRow(row.key, { state: "uploading", error: undefined });
      const body = new FormData();
      body.set("userId", row.userId);
      body.set("year", String(year));
      body.set("month", String(month));
      body.set("replaceExisting", String(replaceExisting));
      body.set("file", row.file);
      try {
        const response = await appCheckFetch("/api/documents/payslips", {
          method: "POST",
          body,
        });
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!response.ok) throw new Error(result.error ?? "payslipSaveFailed");
        updateRow(row.key, { state: "done" });
      } catch (caught) {
        failures += 1;
        const code = caught instanceof Error ? caught.message : "";
        updateRow(row.key, {
          state: "error",
          error: t(uploadErrors[code] ?? "payslipError_payslipSaveFailed"),
        });
      }
    }
    setBusy(false);
    if (failures)
      return setError(
        t("payslipUploadPartiallyFailed").replace("{count}", String(failures)),
      );
    router.push(`/documents/payslips?year=${year}`);
    router.refresh();
  }

  const statusLabel = (row: Row) =>
    row.state === "done"
      ? t("payslipUploaded")
      : row.state === "uploading"
        ? t("uploading")
        : row.state === "error"
          ? row.error
          : t("payslipReady");

  return (
    <form className="card form-card" onSubmit={submit}>
      <div className="form-grid">
        <label>
          {t("year")}
          <input
            className="field"
            type="number"
            min={2000}
            max={2100}
            value={year}
            disabled={busy}
            onChange={(event) => setYear(Number(event.target.value))}
            required
          />
        </label>
        <label>
          {t("month")}
          <select
            className="field"
            value={month}
            disabled={busy}
            onChange={(event) => setMonth(Number(event.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((item) => (
              <option key={item} value={item}>
                {formatPayslipMonth(locale, year || defaultYear, item)}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-row form-wide">
          <input
            type="checkbox"
            checked={replaceExisting}
            disabled={busy}
            onChange={(event) => setReplaceExisting(event.target.checked)}
          />
          <span>
            <strong>{t("replaceExistingPayslips")}</strong>
            <small>{t("replaceExistingPayslipsHelp")}</small>
          </span>
        </label>
        <fieldset className="attachment-fieldset form-wide">
          <legend>{t("files")}</legend>
          <p className="muted">{t("payslipFilesHelp")}</p>
          <input
            className="field"
            type="file"
            multiple
            disabled={busy}
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(event) => {
              addFiles(Array.from(event.currentTarget.files ?? []));
              event.currentTarget.value = "";
            }}
          />
          {rows.length > 0 && (
            <div className="table-wrap payslip-upload-table">
              <table>
                <thead>
                  <tr>
                    <th>{t("file")}</th>
                    <th>{t("employee")}</th>
                    <th>{t("status")}</th>
                    <th>{t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const recipient = recipientById.get(row.userId);
                    return (
                      <tr key={row.key}>
                        <td className="payslip-file-name">{row.file.name}</td>
                        <td>
                          <select
                            className="field"
                            aria-label={t("employee")}
                            value={row.userId}
                            disabled={busy || row.state === "done"}
                            onChange={(event) =>
                              updateRow(row.key, {
                                userId: event.target.value,
                                state: "pending",
                                error: undefined,
                              })
                            }
                          >
                            <option value="">{t("selectEmployee")}</option>
                            {recipients.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} ({item.employeeNumber})
                              </option>
                            ))}
                          </select>
                          {recipient && !recipient.hasAccess && (
                            <small className="payslip-row-hint">
                              {t("payslipRecipientNoAccess")}
                            </small>
                          )}
                          {row.state !== "done" &&
                            duplicates.has(row.userId) && (
                              <small className="payslip-row-hint">
                                {t("payslipDuplicateRecipients")}
                              </small>
                            )}
                        </td>
                        <td>
                          <span
                            className={`status${row.state === "done" ? " status-approved" : row.state === "error" ? " status-rejected" : ""}`}
                          >
                            {statusLabel(row)}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="attachment-remove"
                            disabled={busy || row.state === "done"}
                            aria-label={t("removeAttachment").replace(
                              "{name}",
                              row.file.name,
                            )}
                            title={t("removeAttachment").replace(
                              "{name}",
                              row.file.name,
                            )}
                            onClick={() =>
                              setRows((current) =>
                                current.filter((item) => item.key !== row.key),
                              )
                            }
                          >
                            <FileRemoveIcon />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </fieldset>
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
          onClick={() => router.push(`/documents/payslips?year=${year}`)}
        >
          {rows.some((row) => row.state === "done") ? t("close") : t("cancel")}
        </button>
        <button className="button" disabled={busy || pending.length === 0}>
          {busy
            ? t("uploading")
            : t("uploadPayslipCount").replace(
                "{count}",
                String(pending.length),
              )}
        </button>
      </footer>
    </form>
  );
}
