"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { FileAddIcon, FileRemoveIcon } from "@/components/ui/FileActionIcons";
import {
  isPayslipContentType,
  matchPayslipRecipient,
  parsePayslipPeriod,
  PAYSLIP_MAX_BYTES,
} from "@/domain/payslips";
import { appCheckFetch } from "@/lib/firebase/client";
import type { MessageKey } from "@/lib/localization/messages";
import { MonthStepper } from "../MonthStepper";

export type PayslipRecipient = {
  id: string;
  name: string;
  employeeNumber: string;
  role: string;
  hasAccess: boolean;
};

type Row = {
  key: string;
  userId: string;
  period: string;
  file: File | null;
  replaceExisting: boolean;
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

let rowCounter = 0;
const newRow = (period: string): Row => ({
  key: `row-${++rowCounter}`,
  userId: "",
  period,
  file: null,
  replaceExisting: false,
  state: "pending",
});

export function PayslipUploadForm({
  recipients,
  defaultPeriod,
}: {
  recipients: PayslipRecipient[];
  defaultPeriod: string;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => [newRow(defaultPeriod)]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const recipientById = new Map(recipients.map((item) => [item.id, item]));
  const pending = rows.filter((row) => row.state !== "done");
  const slotKey = (row: Row) => `${row.userId}|${row.period}`;
  const slots = pending.filter((row) => row.userId).map(slotKey);
  const duplicates = new Set(
    slots.filter((slot, index) => slots.indexOf(slot) !== index),
  );

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) =>
        row.key === key
          ? {
              ...row,
              ...patch,
              ...(patch.state ? {} : { state: "pending", error: undefined }),
            }
          : row,
      ),
    );
  }

  function selectFile(row: Row, file: File | null) {
    if (!file) {
      updateRow(row.key, { file: null });
      return true;
    }
    if (!isPayslipContentType(file.type) || file.size > PAYSLIP_MAX_BYTES) {
      updateRow(row.key, {
        file: null,
        state: "error",
        error: t(
          file.size > PAYSLIP_MAX_BYTES
            ? "payslipError_payslipFileTooLarge"
            : "payslipError_payslipFileType",
        ),
      });
      return false;
    }
    updateRow(row.key, {
      file,
      userId:
        row.userId || (matchPayslipRecipient(file.name, recipients) ?? ""),
    });
    return true;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!pending.length) return;
    if (pending.some((row) => !row.userId || !row.file))
      return setError(t("payslipCompleteAllRows"));
    if (pending.some((row) => !parsePayslipPeriod(row.period)))
      return setError(t("payslipError_invalidInput"));
    if (duplicates.size) return setError(t("payslipDuplicateRecipients"));
    setBusy(true);
    let failures = 0;
    for (const row of pending) {
      const period = parsePayslipPeriod(row.period)!;
      updateRow(row.key, { state: "uploading", error: undefined });
      const body = new FormData();
      body.set("userId", row.userId);
      body.set("year", String(period.year));
      body.set("month", String(period.month));
      body.set("replaceExisting", String(row.replaceExisting));
      body.set("file", row.file!);
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
    router.push(`/documents/payslips?period=${pending[0]!.period}`);
    router.refresh();
  }

  const statusLabel = (row: Row) =>
    row.state === "done"
      ? t("payslipUploaded")
      : row.state === "uploading"
        ? t("uploading")
        : row.error;

  return (
    <form className="card form-card" onSubmit={submit}>
      <p className="muted">{t("payslipFilesHelp")}</p>
      <ul className="payslip-upload-rows">
        {rows.map((row) => {
          const recipient = recipientById.get(row.userId);
          const locked = busy || row.state === "done";
          return (
            <li className="payslip-upload-row" key={row.key}>
              <label>
                {t("employee")}
                <select
                  className="field"
                  value={row.userId}
                  disabled={locked}
                  required
                  onChange={(event) =>
                    updateRow(row.key, { userId: event.target.value })
                  }
                >
                  <option value="">{t("selectEmployee")}</option>
                  {recipients.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.employeeNumber})
                    </option>
                  ))}
                </select>
              </label>
              <div className="payslip-upload-period">
                <span>{t("payslipPeriod")}</span>
                <MonthStepper
                  value={row.period}
                  label={t("payslipPeriod")}
                  disabled={locked}
                  onChange={(period) => updateRow(row.key, { period })}
                />
              </div>
              <label>
                {t("file")}
                <input
                  className="field"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  disabled={locked}
                  required={!row.file}
                  onChange={(event) => {
                    if (
                      !selectFile(row, event.currentTarget.files?.[0] ?? null)
                    )
                      event.currentTarget.value = "";
                  }}
                />
              </label>
              <label className="checkbox-row payslip-upload-replace">
                <input
                  type="checkbox"
                  checked={row.replaceExisting}
                  disabled={locked}
                  onChange={(event) =>
                    updateRow(row.key, {
                      replaceExisting: event.target.checked,
                    })
                  }
                />
                <span>
                  <strong>{t("replaceExistingPayslip")}</strong>
                </span>
              </label>
              <button
                type="button"
                className="attachment-remove payslip-upload-remove"
                disabled={locked || rows.length === 1}
                aria-label={t("removePayslipRow")}
                title={t("removePayslipRow")}
                onClick={() =>
                  setRows((current) =>
                    current.filter((item) => item.key !== row.key),
                  )
                }
              >
                <FileRemoveIcon />
              </button>
              {(row.state !== "pending" ||
                (recipient && !recipient.hasAccess) ||
                duplicates.has(slotKey(row))) && (
                <div className="payslip-upload-row-notes">
                  {(row.state === "done" ||
                    row.state === "uploading" ||
                    row.error) && (
                    <span
                      className={`status${row.state === "done" ? " status-approved" : row.state === "error" ? " status-rejected" : ""}`}
                    >
                      {statusLabel(row)}
                    </span>
                  )}
                  {row.state !== "done" && duplicates.has(slotKey(row)) && (
                    <small className="payslip-row-hint">
                      {t("payslipDuplicateRecipients")}
                    </small>
                  )}
                  {recipient && !recipient.hasAccess && (
                    <small className="payslip-row-hint">
                      {t("payslipRecipientNoAccess")}
                    </small>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="attachment-download payslip-upload-add"
        disabled={busy}
        aria-label={t("addPayslipRow")}
        title={t("addPayslipRow")}
        onClick={() =>
          setRows((current) => [
            ...current,
            newRow(current.at(-1)?.period || defaultPeriod),
          ])
        }
      >
        <FileAddIcon />
      </button>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      <footer className="modal-actions">
        <button
          type="button"
          className="button secondary"
          onClick={() =>
            router.push(`/documents/payslips?period=${defaultPeriod}`)
          }
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
