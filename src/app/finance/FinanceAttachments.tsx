"use client";

import { ReactNode, useEffect, useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { appCheckFetch } from "@/lib/firebase/client";
import {
  FileAiIcon,
  FileDownloadIcon,
  FileRemoveIcon,
} from "@/components/ui/FileActionIcons";
import type { FinanceExtraction } from "@/domain/ai";

export type FinanceEntityType = "transaction" | "vatSettlement" | "invoice";
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

export type AiAttachmentSource =
  | { kind: "file"; file: File }
  | { kind: "stored"; entityId: string; attachmentId: string };

/** Asks the server to read one attachment with the configured AI provider. */
export async function processAttachmentWithAi(
  source: AiAttachmentSource,
): Promise<{ extraction?: FinanceExtraction; error?: string }> {
  let init: RequestInit;
  if (source.kind === "file") {
    const body = new FormData();
    body.append("file", source.file);
    init = { method: "POST", body };
  } else {
    init = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entityId: source.entityId,
        attachmentId: source.attachmentId,
      }),
    };
  }
  try {
    const response = await appCheckFetch("/api/ai/finance-attachment", init);
    const result = (await response.json().catch(() => ({}))) as {
      extraction?: FinanceExtraction;
      error?: string;
    };
    return response.ok && result.extraction
      ? { extraction: result.extraction }
      : { error: result.error ?? "aiProviderFailed" };
  } catch {
    return { error: "aiProviderFailed" };
  }
}

function AiProcessButton({
  name,
  busy,
  disabled,
  onClick,
}: {
  name: string;
  busy: boolean;
  disabled: boolean;
  onClick(): void;
}) {
  const { t } = useLocale();
  return (
    <button
      className="attachment-ai"
      type="button"
      aria-label={t("aiProcessAttachmentNamed").replace("{name}", name)}
      title={t("aiProcessAttachmentNamed").replace("{name}", name)}
      disabled={disabled}
      aria-busy={busy}
      onClick={onClick}
    >
      <FileAiIcon />
      <span>{busy ? t("aiProcessing") : t("aiProcessAttachment")}</span>
    </button>
  );
}

export function FinanceAttachments({
  entityType,
  entityId,
  files,
  onFilesChange,
  removedAttachmentIds,
  onRemovedAttachmentIdsChange,
  ai,
}: {
  entityType: FinanceEntityType;
  entityId?: string;
  files: File[];
  onFilesChange(files: File[]): void;
  removedAttachmentIds: string[];
  onRemovedAttachmentIdsChange(ids: string[]): void;
  /** Shows "Process attachment with AI" next to each file when set. */
  ai?: {
    busyKey: string | null;
    onProcess(source: AiAttachmentSource, key: string, name: string): void;
  };
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
              {ai && (
                <AiProcessButton
                  name={attachment.name}
                  busy={ai.busyKey === attachment.id}
                  disabled={ai.busyKey !== null}
                  onClick={() =>
                    ai.onProcess(
                      {
                        kind: "stored",
                        entityId: entityId!,
                        attachmentId: attachment.id,
                      },
                      attachment.id,
                      attachment.name,
                    )
                  }
                />
              )}
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
                <FileRemoveIcon />
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
            {files.map((file, index) => {
              const key = `${file.name}-${file.size}-${file.lastModified}`;
              return (
                <li key={key}>
                  <span>{file.name}</span>
                  {ai && (
                    <AiProcessButton
                      name={file.name}
                      busy={ai.busyKey === key}
                      disabled={ai.busyKey !== null}
                      onClick={() =>
                        ai.onProcess({ kind: "file", file }, key, file.name)
                      }
                    />
                  )}
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
                    <FileRemoveIcon />
                  </button>
                </li>
              );
            })}
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
  const [error, setError] = useState(false);
  useEffect(() => {
    void appCheckFetch(
      `/api/finance/attachments/${entityType}/${encodeURIComponent(entityId)}`,
    )
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((result: { attachments?: Attachment[] }) =>
        setItems(result.attachments ?? []),
      )
      .catch(() => setError(true));
  }, [entityId, entityType]);
  return (
    <div className="detail-attachments">
      <strong>{t("attachments")}</strong>
      {error ? (
        <p className="notice notice-error" role="alert">
          {t("financeError_attachmentLoadFailed")}
        </p>
      ) : items === null ? (
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
                <FileDownloadIcon />
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
