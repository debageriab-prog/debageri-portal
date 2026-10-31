"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  AttachmentPreviewModal,
  canPreview,
  PreviewButton,
  type PreviewTarget,
} from "@/app/finance/FinanceAttachments";
import { useLocale } from "@/components/localization/LocaleProvider";
import { downloadFile } from "@/components/ui/DocumentPreview";
import {
  FileDownloadIcon,
  FileRemoveIcon,
} from "@/components/ui/FileActionIcons";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  TIMESHEET_ATTACHMENT_CONTENT_TYPES,
  TIMESHEET_ATTACHMENT_MAX_FILES,
  timesheetAttachmentFileError,
} from "@/domain/timesheets/attachments";
import { appCheckFetch } from "@/lib/firebase/client";

type Translate = ReturnType<typeof useLocale>["t"];
type Attachment = {
  id: string;
  name: string;
  size: number;
  contentType: string;
  canRemove: boolean;
};
type Listing = {
  attachments: Attachment[];
  canAdd: boolean;
};

function attachmentsUrl(timesheetId: string) {
  return `/api/timesheets/${encodeURIComponent(timesheetId)}/attachments`;
}

export function timesheetAttachmentMessage(t: Translate, code?: string) {
  const key = `timesheetAttachmentError_${code}` as Parameters<Translate>[0];
  return t(key) ?? t("timesheetAttachmentError_attachmentUploadFailed");
}

/** Uploads one file per request, stopping at the first file that fails. */
export async function uploadTimesheetAttachments(
  timesheetId: string,
  files: File[],
) {
  let uploaded = 0;
  for (const file of files) {
    const body = new FormData();
    body.append("file", file);
    try {
      const response = await appCheckFetch(attachmentsUrl(timesheetId), {
        method: "POST",
        body,
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        return { uploaded, error: result.error ?? "attachmentUploadFailed" };
      }
    } catch {
      return { uploaded, error: "attachmentUploadFailed" };
    }
    uploaded += 1;
  }
  return { uploaded };
}

/**
 * Files on a time report. Without `onFilesChange` it only lists stored files.
 * With it, the reporter picks files, which wait in `files` and are uploaded by
 * the parent on submit when `uploadOnSubmit` is set, or by the Add files button
 * on a report that has already been sent. Its dialogs render on the body so
 * they cover the page when this sits inside another modal.
 */
export function TimesheetAttachments({
  timesheetId,
  files = [],
  onFilesChange,
  uploadOnSubmit = false,
  refreshKey = 0,
}: {
  timesheetId: string;
  files?: File[];
  onFilesChange?(files: File[]): void;
  uploadOnSubmit?: boolean;
  refreshKey?: number;
}) {
  const { t } = useLocale();
  const [listing, setListing] = useState<Listing | null>(null);
  const [reloads, setReloads] = useState(0);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState<PreviewTarget | null>(null);
  const [removing, setRemoving] = useState<Attachment | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState("");

  useEffect(() => {
    let active = true;
    void appCheckFetch(attachmentsUrl(timesheetId))
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((result: Listing) => {
        if (active) setListing(result);
      })
      .catch(() => {
        if (active)
          setError(t("timesheetAttachmentError_attachmentLoadFailed"));
      });
    return () => {
      active = false;
    };
  }, [timesheetId, refreshKey, reloads, t]);

  const stored = listing?.attachments ?? [];
  const remaining = Math.max(
    0,
    TIMESHEET_ATTACHMENT_MAX_FILES - stored.length - files.length,
  );
  const canSelect =
    onFilesChange !== undefined &&
    listing !== null &&
    (uploadOnSubmit || listing.canAdd);

  function selectFiles(selected: File[]) {
    const invalid = selected
      .map(timesheetAttachmentFileError)
      .find((code) => code !== null);
    const accepted = selected.filter(
      (candidate) =>
        !timesheetAttachmentFileError(candidate) &&
        !files.some(
          (file) =>
            file.name === candidate.name &&
            file.size === candidate.size &&
            file.lastModified === candidate.lastModified,
        ),
    );
    setError(
      invalid
        ? timesheetAttachmentMessage(t, invalid)
        : accepted.length > remaining
          ? timesheetAttachmentMessage(t, "attachmentLimit")
          : "",
    );
    onFilesChange?.([...files, ...accepted.slice(0, remaining)]);
  }

  async function uploadNow() {
    setUploading(true);
    setError("");
    const result = await uploadTimesheetAttachments(timesheetId, files);
    setUploading(false);
    onFilesChange?.(files.slice(result.uploaded));
    if (result.error) setError(timesheetAttachmentMessage(t, result.error));
    setReloads((value) => value + 1);
  }

  async function remove() {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError("");
    try {
      const response = await appCheckFetch(
        `${attachmentsUrl(timesheetId)}/${encodeURIComponent(removing.id)}`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirmation }),
        },
      );
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setRemoveError(
          timesheetAttachmentMessage(
            t,
            result.error ?? "attachmentRemoveFailed",
          ),
        );
        return;
      }
      setRemoving(null);
      setReloads((value) => value + 1);
    } catch {
      setRemoveError(timesheetAttachmentMessage(t, "attachmentRemoveFailed"));
    } finally {
      setRemoveBusy(false);
    }
  }

  return (
    <fieldset className="attachment-fieldset timesheet-attachments">
      <legend>
        {t("attachments")} <InfoTip text={t("timesheetAttachmentsHelp")} />
      </legend>
      {listing === null && !error && <p className="muted">{t("loading")}</p>}
      {listing !== null && stored.length === 0 && files.length === 0 && (
        <p className="muted">{t("noAttachments")}</p>
      )}
      {stored.length > 0 && (
        <ul className="attachment-list editable-attachment-list">
          {stored.map((attachment) => {
            const fileUrl = `${attachmentsUrl(timesheetId)}/${encodeURIComponent(attachment.id)}`;
            const downloadLabel = t("downloadAttachment").replace(
              "{name}",
              attachment.name,
            );
            const removeLabel = t("removeAttachment").replace(
              "{name}",
              attachment.name,
            );
            return (
              <li key={attachment.id}>
                <span className="stored-attachment-name">
                  {attachment.name}
                </span>
                {canPreview(attachment.contentType) && (
                  <PreviewButton
                    name={attachment.name}
                    onClick={() =>
                      setPreviewing({
                        name: attachment.name,
                        contentType: attachment.contentType,
                        fileUrl,
                      })
                    }
                  />
                )}
                <button
                  className="attachment-download"
                  type="button"
                  aria-label={downloadLabel}
                  title={downloadLabel}
                  onClick={() => {
                    setError("");
                    void downloadFile(fileUrl, attachment.name)
                      .catch(() => false)
                      .then((ok) => {
                        if (!ok) setError(t("documentDownloadFailed"));
                      });
                  }}
                >
                  <FileDownloadIcon />
                </button>
                {attachment.canRemove && (
                  <button
                    className="attachment-remove"
                    type="button"
                    aria-label={removeLabel}
                    title={removeLabel}
                    onClick={() => {
                      setConfirmation("");
                      setRemoveError("");
                      setRemoving(attachment);
                    }}
                  >
                    <FileRemoveIcon />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canSelect && remaining > 0 && (
        <input
          className="field"
          type="file"
          aria-label={t("addTimesheetAttachments")}
          accept={TIMESHEET_ATTACHMENT_CONTENT_TYPES.join(",")}
          multiple
          disabled={uploading}
          onChange={(event) => {
            selectFiles(Array.from(event.target.files ?? []));
            event.currentTarget.value = "";
          }}
        />
      )}
      {files.length > 0 && (
        <>
          <ul className="attachment-list pending-attachment-list">
            {files.map((file, index) => {
              const removeLabel = t("removeAttachment").replace(
                "{name}",
                file.name,
              );
              return (
                <li key={`${file.name}-${file.size}-${file.lastModified}`}>
                  <span>{file.name}</span>
                  {canPreview(file.type) && (
                    <PreviewButton
                      name={file.name}
                      onClick={() =>
                        setPreviewing({
                          name: file.name,
                          contentType: file.type,
                          blob: file,
                        })
                      }
                    />
                  )}
                  <button
                    className="attachment-remove"
                    type="button"
                    aria-label={removeLabel}
                    title={removeLabel}
                    disabled={uploading}
                    onClick={() =>
                      onFilesChange?.(
                        files.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <FileRemoveIcon />
                  </button>
                </li>
              );
            })}
          </ul>
          {uploadOnSubmit ? (
            <p className="muted">{t("timesheetAttachmentsOnSubmit")}</p>
          ) : (
            <div className="actions">
              <button
                className="button secondary"
                type="button"
                disabled={uploading}
                onClick={() => void uploadNow()}
              >
                {uploading ? t("uploading") : t("addTimesheetAttachments")}
              </button>
            </div>
          )}
        </>
      )}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      {previewing &&
        createPortal(
          <AttachmentPreviewModal
            target={previewing}
            onClose={() => setPreviewing(null)}
          />,
          document.body,
        )}
      {removing &&
        createPortal(
          <div className="modal-backdrop" role="presentation">
            <section
              className="modal modal-small"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="timesheet-attachment-remove-title"
            >
              <header className="modal-header">
                <div>
                  <h2 id="timesheet-attachment-remove-title">
                    {t("removeAttachmentTitle")}
                  </h2>
                  <p>
                    {t("removeTimesheetAttachmentDescription").replace(
                      "{name}",
                      removing.name,
                    )}
                  </p>
                </div>
              </header>
              {removeError && (
                <p className="notice notice-error" role="alert">
                  {removeError}
                </p>
              )}
              <label>
                {t("typeAttachmentDeleteConfirmation").replace(
                  "{phrase}",
                  t("attachmentDeleteConfirmationPhrase"),
                )}
                <input
                  className="field"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                  autoFocus
                />
              </label>
              <footer className="modal-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setRemoving(null)}
                >
                  {t("cancel")}
                </button>
                <button
                  className="button danger"
                  type="button"
                  disabled={
                    removeBusy ||
                    confirmation !== t("attachmentDeleteConfirmationPhrase")
                  }
                  onClick={() => void remove()}
                >
                  {t("remove")}
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
    </fieldset>
  );
}
