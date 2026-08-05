"use client";

import { ReactNode, useEffect, useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { appCheckFetch } from "@/lib/firebase/client";

export type FinanceEntityType = "transaction" | "vatSettlement";
type Attachment = {
  id: string;
  name: string;
  size: number;
  contentType: string;
};

export function AttachmentDownloadLink({
  entityType,
  entityId,
  attachmentId,
  name,
  className = "text-link",
  children,
}: {
  entityType: FinanceEntityType;
  entityId: string;
  attachmentId: string;
  name: string;
  className?: string;
  children?: ReactNode;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const href = `/api/finance/attachments/${entityType}/${encodeURIComponent(entityId)}/${encodeURIComponent(attachmentId)}`;
  const label = t("downloadAttachment").replace("{name}", name);

  return (
    <>
      <a
        className={className}
        href={href}
        aria-label={label}
        aria-disabled={busy}
        title={label}
        onClick={(event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError(false);
          void appCheckFetch(href)
            .then(async (response) => {
              if (!response.ok) throw new Error("download failed");
              const url = URL.createObjectURL(await response.blob());
              const download = document.createElement("a");
              download.href = url;
              download.download = name;
              download.click();
              window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
            })
            .catch(() => setError(true))
            .finally(() => setBusy(false));
        }}
      >
        {children ?? name}
      </a>
      {error && (
        <span
          className="notice notice-error attachment-download-notice"
          role="alert"
        >
          {t("financeError_attachmentDownloadFailed")}
        </span>
      )}
    </>
  );
}

function DeleteIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
      <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
    </svg>
  );
}

export async function uploadFinanceAttachments(
  entityType: FinanceEntityType,
  entityId: string,
  files: File[],
) {
  if (!files.length) return { ok: true };
  const body = new FormData();
  files.forEach((file) => body.append("files", file));
  const response = await appCheckFetch(
    `/api/finance/attachments/${entityType}/${encodeURIComponent(entityId)}`,
    { method: "POST", body },
  );
  const result = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  return { ok: response.ok, error: result.error };
}

export async function saveFinanceAttachmentChanges(
  entityType: FinanceEntityType,
  entityId: string,
  files: File[],
  removedAttachmentIds: string[],
) {
  for (const attachmentId of removedAttachmentIds) {
    const response = await appCheckFetch(
      `/api/finance/attachments/${entityType}/${encodeURIComponent(entityId)}/${encodeURIComponent(attachmentId)}`,
      { method: "DELETE" },
    );
    if (!response.ok) return { ok: false, error: "attachmentDeleteFailed" };
  }
  return uploadFinanceAttachments(entityType, entityId, files);
}

export function FinanceAttachments({
  entityType,
  entityId,
  files,
  onFilesChange,
  removedAttachmentIds,
  onRemovedAttachmentIdsChange,
}: {
  entityType: FinanceEntityType;
  entityId?: string;
  files: File[];
  onFilesChange(files: File[]): void;
  removedAttachmentIds: string[];
  onRemovedAttachmentIdsChange(ids: string[]): void;
}) {
  const { t } = useLocale();
  const [existing, setExisting] = useState<Attachment[]>([]);
  const [error, setError] = useState("");
  const [confirmingRemoval, setConfirmingRemoval] = useState<Attachment | null>(
    null,
  );
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (!entityId) return;
    void appCheckFetch(
      `/api/finance/attachments/${entityType}/${encodeURIComponent(entityId)}`,
    )
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((result: { attachments: Attachment[] }) =>
        setExisting(result.attachments),
      )
      .catch(() => setError(t("financeError_attachmentLoadFailed")));
  }, [entityId, entityType, t]);

  const remaining = Math.max(0, 3 - existing.length - files.length);
  return (
    <fieldset className="form-wide attachment-fieldset">
      <legend>{t("attachments")}</legend>
      <p className="muted">{t("financeAttachmentsHelp")}</p>
      {existing.length > 0 && (
        <ul className="attachment-list editable-attachment-list">
          {existing.map((attachment) => (
            <li key={attachment.id}>
              <AttachmentDownloadLink
                entityType={entityType}
                entityId={entityId!}
                attachmentId={attachment.id}
                name={attachment.name}
              />
              <button
                className="attachment-remove"
                type="button"
                aria-label={t("removeAttachment").replace(
                  "{name}",
                  attachment.name,
                )}
                title={t("removeAttachment").replace("{name}", attachment.name)}
                onClick={() => {
                  setConfirmation("");
                  setConfirmingRemoval(attachment);
                }}
              >
                <DeleteIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      {remaining > 0 && (
        <input
          className="field"
          type="file"
          accept="application/pdf,message/rfc822,.eml,image/jpeg,image/png,image/webp"
          multiple
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []);
            const unique = selected.filter(
              (candidate) =>
                !files.some(
                  (file) =>
                    file.name === candidate.name &&
                    file.size === candidate.size &&
                    file.lastModified === candidate.lastModified,
                ),
            );
            onFilesChange(
              [...files, ...unique].slice(0, files.length + remaining),
            );
            event.currentTarget.value = "";
          }}
        />
      )}
      {files.length > 0 && (
        <>
          <p className="muted">
            {t("filesSelected").replace("{count}", String(files.length))}
          </p>
          <ul className="attachment-list pending-attachment-list">
            {files.map((file, index) => (
              <li key={`${file.name}-${file.size}-${file.lastModified}`}>
                <span>{file.name}</span>
                <button
                  className="attachment-remove"
                  type="button"
                  aria-label={t("removeAttachment").replace(
                    "{name}",
                    file.name,
                  )}
                  title={t("removeAttachment").replace("{name}", file.name)}
                  onClick={() =>
                    onFilesChange(
                      files.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <DeleteIcon />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p className="notice notice-error">{error}</p>}
      {confirmingRemoval && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="attachment-delete-title"
          >
            <header className="modal-header">
              <div>
                <h2 id="attachment-delete-title">
                  {t("removeAttachmentTitle")}
                </h2>
                <p>
                  {t("removeAttachmentDescription").replace(
                    "{name}",
                    confirmingRemoval.name,
                  )}
                </p>
              </div>
            </header>
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
                onClick={() => setConfirmingRemoval(null)}
              >
                {t("cancel")}
              </button>
              <button
                className="button danger"
                type="button"
                disabled={
                  confirmation !== t("attachmentDeleteConfirmationPhrase")
                }
                onClick={() => {
                  setExisting((items) =>
                    items.filter((item) => item.id !== confirmingRemoval.id),
                  );
                  onRemovedAttachmentIdsChange([
                    ...removedAttachmentIds,
                    confirmingRemoval.id,
                  ]);
                  setConfirmingRemoval(null);
                  setConfirmation("");
                }}
              >
                {t("removeAttachmentButton")}
              </button>
            </footer>
          </section>
        </div>
      )}
    </fieldset>
  );
}

export function AttachmentDownloads({
  entityType,
  entityId,
}: {
  entityType: FinanceEntityType;
  entityId: string;
}) {
  const { t } = useLocale();
  const [items, setItems] = useState<Attachment[] | null>(null);
  useEffect(() => {
    void appCheckFetch(
      `/api/finance/attachments/${entityType}/${encodeURIComponent(entityId)}`,
    )
      .then((response) => response.json())
      .then((result: { attachments?: Attachment[] }) =>
        setItems(result.attachments ?? []),
      )
      .catch(() => setItems([]));
  }, [entityId, entityType]);
  return (
    <div className="detail-attachments">
      <strong>{t("attachments")}</strong>
      {items === null ? (
        <p>{t("loading")}</p>
      ) : items.length ? (
        <ul className="attachment-list">
          {items.map((item) => (
            <li key={item.id}>
              <span>{item.name}</span>
              <AttachmentDownloadLink
                className="attachment-download"
                entityType={entityType}
                entityId={entityId}
                attachmentId={item.id}
                name={item.name}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                >
                  <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14" />
                </svg>
              </AttachmentDownloadLink>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t("noAttachments")}</p>
      )}
    </div>
  );
}
