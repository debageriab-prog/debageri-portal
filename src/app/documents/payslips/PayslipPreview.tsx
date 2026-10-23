"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { FileDownloadIcon } from "@/components/ui/FileActionIcons";
import { appCheckFetch } from "@/lib/firebase/client";

export type PayslipItem = {
  id: string;
  userId: string;
  userName: string;
  period: string;
  year: number;
  month: number;
  fileName: string;
  contentType: string;
  uploadedAt: string;
};

export const payslipFileUrl = (id: string) =>
  `/api/documents/payslips/${encodeURIComponent(id)}/file`;

export async function downloadPayslip(item: PayslipItem) {
  const response = await appCheckFetch(payslipFileUrl(item.id));
  if (!response.ok) return false;
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = item.fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return true;
}

export function PrintIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
      <path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z" />
    </svg>
  );
}

export function PayslipPreview({ payslip }: { payslip: PayslipItem }) {
  const { t } = useLocale();
  const [loaded, setLoaded] = useState<{ id: string; url: string } | null>(
    null,
  );
  const [failedId, setFailedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const printFrame = useRef<HTMLIFrameElement | null>(null);
  const isImage = payslip.contentType.startsWith("image/");

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void appCheckFetch(`${payslipFileUrl(payslip.id)}?disposition=inline`)
      .then(async (response) => {
        if (!response.ok) throw new Error("payslipLoadFailed");
        const blob = await response.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ id: payslip.id, url: objectUrl });
      })
      .catch(() => {
        if (active) setFailedId(payslip.id);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      printFrame.current?.remove();
      printFrame.current = null;
    };
  }, [payslip.id]);

  const url = loaded?.id === payslip.id ? loaded.url : null;
  const failed = failedId === payslip.id;

  function print() {
    if (!url) return;
    setActionError("");
    printFrame.current?.remove();
    const frame = document.createElement("iframe");
    frame.className = "payslip-print-frame";
    frame.setAttribute("aria-hidden", "true");
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        setActionError(t("payslipPrintFailed"));
      }
    };
    if (isImage) {
      const image = document.createElement("img");
      image.src = url;
      image.alt = "";
      image.setAttribute("style", "max-width:100%");
      frame.srcdoc = `<!doctype html><html><body style="margin:0">${image.outerHTML}</body></html>`;
    } else frame.src = url;
    document.body.appendChild(frame);
    printFrame.current = frame;
  }

  async function download() {
    setActionError("");
    if (!(await downloadPayslip(payslip)))
      setActionError(t("payslipDownloadFailed"));
  }

  return (
    <div className="payslip-preview-wrap">
      <div className="payslip-preview-actions">
        <button
          type="button"
          className="button secondary payslip-action-button"
          onClick={() => void download()}
        >
          <FileDownloadIcon />
          {t("download")}
        </button>
        <button
          type="button"
          className="button secondary payslip-action-button"
          disabled={!url}
          onClick={print}
        >
          <PrintIcon />
          {t("print")}
        </button>
      </div>
      {actionError && (
        <p className="notice notice-error" role="alert">
          {actionError}
        </p>
      )}
      <div className="payslip-preview">
        {failed ? (
          <p className="notice notice-error" role="alert">
            {t("payslipLoadFailed")}
          </p>
        ) : !url ? (
          <p className="muted payslip-preview-loading">{t("loading")}</p>
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={t("payslipPreviewTitle")} />
        ) : (
          <iframe src={url} title={t("payslipPreviewTitle")} />
        )}
      </div>
    </div>
  );
}
