"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { DocumentPreview, downloadFile } from "@/components/ui/DocumentPreview";
import {
  FileAttachmentIcon,
  FileDownloadIcon,
  FileViewIcon,
} from "@/components/ui/FileActionIcons";

/**
 * How files are shown: in list tables as a paper clip (hover shows the name,
 * click opens the preview), in details and forms as the name followed by an
 * eye icon. Download and print live in the preview popup. Files the browser
 * cannot preview fall back to a download icon.
 */

export type PreviewTarget = {
  name: string;
  contentType: string;
  fileUrl?: string;
  blob?: Blob;
};

export function canPreview(contentType: string) {
  return contentType === "application/pdf" || contentType.startsWith("image/");
}

/** A content type guessed from the file name, for files stored without one. */
export function contentTypeFromName(name: string) {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png" || extension === "webp" || extension === "gif")
    return `image/${extension}`;
  return "application/octet-stream";
}

export function PreviewButton({
  name,
  onClick,
}: {
  name: string;
  onClick(): void;
}) {
  const { t } = useLocale();
  const label = t("previewAttachment").replace("{name}", name);
  return (
    <button
      className="attachment-view"
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <FileViewIcon />
    </button>
  );
}

export function FilePreviewModal({
  target,
  onClose,
}: {
  target: PreviewTarget;
  onClose(): void;
}) {
  const { t } = useLocale();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal payslip-modal attachment-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attachment-preview-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">{t("attachments")}</span>
            <h2 id="attachment-preview-title">{target.name}</h2>
          </div>
          <button
            className="modal-close"
            type="button"
            aria-label={t("close")}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <DocumentPreview
          fileUrl={target.fileUrl}
          blob={target.blob}
          fileName={target.name}
          contentType={target.contentType}
          title={target.name}
        />
      </section>
    </div>
  );
}

/** Download button for files that cannot be previewed. */
function DownloadButton({ target }: { target: PreviewTarget }) {
  const { t } = useLocale();
  const [failed, setFailed] = useState(false);
  const label = t("downloadAttachment").replace("{name}", target.name);
  return (
    <>
      <button
        className="attachment-download"
        type="button"
        aria-label={label}
        title={label}
        onClick={() => {
          setFailed(false);
          if (target.blob) {
            const url = URL.createObjectURL(target.blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = target.name;
            anchor.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
            return;
          }
          if (target.fileUrl)
            void downloadFile(target.fileUrl, target.name)
              .catch(() => false)
              .then((ok) => setFailed(!ok));
        }}
      >
        <FileDownloadIcon />
      </button>
      {failed && (
        <span
          className="notice notice-error attachment-download-notice"
          role="alert"
        >
          {t("documentDownloadFailed")}
        </span>
      )}
    </>
  );
}

/**
 * The eye icon that opens the preview, or a download icon when the file
 * cannot be previewed. Put it after the file name.
 */
export function FilePreviewAction({ target }: { target: PreviewTarget }) {
  const [open, setOpen] = useState(false);
  if (!canPreview(target.contentType))
    return <DownloadButton target={target} />;
  return (
    <>
      <PreviewButton name={target.name} onClick={() => setOpen(true)} />
      {open && (
        <FilePreviewModal target={target} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/** A file in a detail view or form: its name, then the eye icon. */
export function FileName({ target }: { target: PreviewTarget }) {
  return (
    <span className="stored-attachment">
      <span className="stored-attachment-name">{target.name}</span>
      <FilePreviewAction target={target} />
    </span>
  );
}

/** A file in a list table: a paper clip that shows the name on hover. */
export function FileClip({ target }: { target: PreviewTarget }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const previewable = canPreview(target.contentType);
  return (
    <>
      <button
        className="attachment-view"
        type="button"
        aria-label={(previewable
          ? t("previewAttachment")
          : t("downloadAttachment")
        ).replace("{name}", target.name)}
        title={target.name}
        onClick={() => {
          if (previewable) return setOpen(true);
          setFailed(false);
          if (target.fileUrl)
            void downloadFile(target.fileUrl, target.name)
              .catch(() => false)
              .then((ok) => setFailed(!ok));
        }}
      >
        <FileAttachmentIcon />
      </button>
      {failed && (
        <span
          className="notice notice-error attachment-download-notice"
          role="alert"
        >
          {t("documentDownloadFailed")}
        </span>
      )}
      {open && (
        <FilePreviewModal target={target} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/** Several files in one table cell, as paper clips side by side. */
export function FileClips({ targets }: { targets: PreviewTarget[] }) {
  if (!targets.length) return <>-</>;
  return (
    <span className="table-attachment-clips">
      {targets.map((target, index) => (
        <FileClip key={`${target.name}-${index}`} target={target} />
      ))}
    </span>
  );
}
