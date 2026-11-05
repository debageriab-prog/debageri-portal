"use client";

import { useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { appCheckFetch } from "@/lib/firebase/client";
import type { MessageKey } from "@/lib/localization/messages";

export type ExportFormat = "xlsx" | "pdf";

/** Fetches a report and saves it under the name the server gave it. */
export async function downloadReport(url: string, fallbackName: string) {
  const response = await appCheckFetch(url);
  if (!response.ok) throw new Error(String(response.status));
  const encoded = /filename\*=UTF-8''([^;]+)/.exec(
    response.headers.get("content-disposition") ?? "",
  )?.[1];
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = encoded ? decodeURIComponent(encoded) : fallbackName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

/**
 * The Excel and PDF icon buttons for a report export. `query` is the period
 * and person; the format is added per button. Errors show as a notice below.
 */
export function ReportExportButtons({
  endpoint,
  query,
  hints,
  errorKey,
  disabled = false,
}: {
  endpoint: string;
  query: Record<string, string>;
  hints: Record<ExportFormat, MessageKey>;
  errorKey: MessageKey;
  disabled?: boolean;
}) {
  const { t } = useLocale();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  async function exportReport(format: ExportFormat) {
    setExporting(true);
    setError("");
    try {
      await downloadReport(
        `${endpoint}?${new URLSearchParams({ ...query, format })}`,
        `Report.${format}`,
      );
    } catch {
      setError(t(errorKey));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="report-export">
        {(["xlsx", "pdf"] as const).map((format) => (
          <button
            key={format}
            className="table-action icon-action"
            type="button"
            aria-label={t(format === "xlsx" ? "exportExcel" : "exportPdf")}
            title={t(hints[format])}
            disabled={disabled || exporting}
            onClick={() => void exportReport(format)}
          >
            <ActionIcon type={format === "xlsx" ? "excel" : "pdf"} />
          </button>
        ))}
      </div>
      {error && (
        <p className="notice notice-error report-export-error">{error}</p>
      )}
    </>
  );
}
