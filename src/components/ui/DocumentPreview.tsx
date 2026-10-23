"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { FileDownloadIcon } from "@/components/ui/FileActionIcons";
import { appCheckFetch } from "@/lib/firebase/client";

export async function downloadFile(fileUrl: string, fileName: string) {
  const response = await appCheckFetch(fileUrl);
  if (!response.ok) return false;
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
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

/**
 * Inline PDF or image preview of a server-protected file, with icon-only
 * download and print buttons. `toolbar` renders before the buttons and
 * `toolbarEnd` after them.
 */
export function DocumentPreview({
  fileUrl,
  fileName,
  contentType,
  title,
  toolbar,
  toolbarEnd,
}: {
  fileUrl: string;
  fileName: string;
  contentType: string;
  title: string;
  toolbar?: React.ReactNode;
  toolbarEnd?: React.ReactNode;
}) {
  const { t } = useLocale();
  const [loaded, setLoaded] = useState<{ src: string; url: string } | null>(
    null,
  );
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const printFrame = useRef<HTMLIFrameElement | null>(null);
  const isImage = contentType.startsWith("image/");

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void appCheckFetch(`${fileUrl}?disposition=inline`)
      .then(async (response) => {
        if (!response.ok) throw new Error("documentLoadFailed");
        const blob = await response.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ src: fileUrl, url: objectUrl });
      })
      .catch(() => {
        if (active) setFailedSrc(fileUrl);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      printFrame.current?.remove();
      printFrame.current = null;
    };
  }, [fileUrl]);

  const url = loaded?.src === fileUrl ? loaded.url : null;
  const failed = failedSrc === fileUrl;

  function print() {
    if (!url) return;
    setActionError("");
    printFrame.current?.remove();
    const frame = document.createElement("iframe");
    frame.className = "document-print-frame";
    frame.setAttribute("aria-hidden", "true");
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        setActionError(t("documentPrintFailed"));
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
    if (!(await downloadFile(fileUrl, fileName)))
      setActionError(t("documentDownloadFailed"));
  }

  return (
    <div className="document-preview-wrap">
      <div className="document-toolbar">
        {toolbar}
        <div className="row-actions">
          <button
            type="button"
            className="table-action icon-action document-icon-action"
            aria-label={t("download")}
            title={t("download")}
            onClick={() => void download()}
          >
            <FileDownloadIcon />
          </button>
          <button
            type="button"
            className="table-action icon-action document-icon-action"
            aria-label={t("print")}
            title={t("print")}
            disabled={!url}
            onClick={print}
          >
            <PrintIcon />
          </button>
        </div>
        {toolbarEnd}
      </div>
      {actionError && (
        <p className="notice notice-error" role="alert">
          {actionError}
        </p>
      )}
      <div className="document-preview">
        {failed ? (
          <p className="notice notice-error" role="alert">
            {t("documentLoadFailed")}
          </p>
        ) : !url ? (
          <p className="muted document-preview-loading">{t("loading")}</p>
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={title} />
        ) : (
          <iframe src={url} title={title} />
        )}
      </div>
    </div>
  );
}
