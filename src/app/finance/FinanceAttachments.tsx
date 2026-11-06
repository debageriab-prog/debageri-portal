"use client";

import { InfoTip } from "@/components/ui/InfoTip";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { appCheckFetch } from "@/lib/firebase/client";
import {
  FileAiIcon,
  FileRemoveIcon,
  SuccessCheckIcon,
} from "@/components/ui/FileActionIcons";
import {
  canPreview,
  FileClip,
  FileName,
  FilePreviewAction,
  FilePreviewModal,
  PreviewButton,
  type PreviewTarget,
} from "@/components/ui/FilePreview";
import {
  DetailFile,
  DetailFiles,
  DetailSection,
} from "@/components/ui/DetailView";
import type { AiExtractionPurpose, FinanceExtraction } from "@/domain/ai";

export type FinanceEntityType = "transaction" | "vatSettlement" | "invoice";
type Attachment = {
  id: string;
  name: string;
  size: number;
  contentType: string;
  /** The invoice PDF the portal made; it doesn't count toward the limit. */
  generated?: boolean;
};

/** The invoice PDF made in the form before saving, shown with the files. */
export type GeneratedInvoicePdf = {
  file: File | null;
  busy: boolean;
  /** The form changed after the PDF was made. */
  stale: boolean;
  error: string;
  onGenerate(): void;
  onRemove(): void;
};

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

function attachmentUrl(
  entityType: FinanceEntityType,
  entityId: string,
  attachmentId: string,
) {
  return `/api/finance/attachments/${entityType}/${encodeURIComponent(entityId)}/${encodeURIComponent(attachmentId)}`;
}

export type AiAttachmentSource =
  | { kind: "file"; file: File }
  | { kind: "stored"; entityId: string; attachmentId: string };

/** Asks the server to read one attachment with the configured AI provider. */
export async function processAttachmentWithAi(
  source: AiAttachmentSource,
  purpose: AiExtractionPurpose = "transaction",
): Promise<{
  extraction?: FinanceExtraction;
  error?: string;
  detail?: string;
}> {
  let init: RequestInit;
  if (source.kind === "file") {
    const body = new FormData();
    body.append("file", source.file);
    body.append("purpose", purpose);
    init = { method: "POST", body };
  } else {
    init = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entityId: source.entityId,
        attachmentId: source.attachmentId,
        purpose,
      }),
    };
  }
  try {
    const response = await appCheckFetch("/api/ai/finance-attachment", init);
    const result = (await response.json().catch(() => ({}))) as {
      extraction?: FinanceExtraction;
      error?: string;
      detail?: string;
    };
    return response.ok && result.extraction
      ? { extraction: result.extraction }
      : { error: result.error ?? "aiProviderFailed", detail: result.detail };
  } catch {
    return { error: "aiProviderFailed" };
  }
}

function AiProcessButton({
  name,
  busy,
  disabled,
  processed,
  onClick,
}: {
  name: string;
  busy: boolean;
  disabled: boolean;
  processed: boolean;
  onClick(): void;
}) {
  const { t } = useLocale();
  if (processed)
    return (
      <span className="attachment-ai-done" role="status">
        <SuccessCheckIcon size={16} />
        <span>{t("aiProcessed")}</span>
      </span>
    );
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
  generated,
}: {
  entityType: FinanceEntityType;
  entityId?: string;
  /** Offers making the invoice PDF and attaching it, for invoices. */
  generated?: GeneratedInvoicePdf;
  files: File[];
  onFilesChange(files: File[]): void;
  removedAttachmentIds: string[];
  onRemovedAttachmentIdsChange(ids: string[]): void;
  /** Shows "Process attachment with AI" next to each file when set. */
  ai?: {
    busyKey: string | null;
    /** Keys of attachments already read with AI. */
    processedKeys: string[];
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
  const [previewing, setPreviewing] = useState<PreviewTarget | null>(null);
  // A removed stored invoice PDF, kept apart so a new one made before
  // saving (which reuses its place) is not removed along with it.
  const [removedGeneratedIds, setRemovedGeneratedIds] = useState<string[]>([]);

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

  const uploaded = existing.filter((attachment) => !attachment.generated);
  const remaining = Math.max(0, 3 - uploaded.length - files.length);
  // A newly made PDF replaces the stored one when the invoice is saved.
  const shownExisting = generated?.file ? uploaded : existing;
  const hasPdf = Boolean(
    generated?.file || existing.some((attachment) => attachment.generated),
  );
  return (
    <fieldset className="form-wide attachment-fieldset">
      <legend>{t("attachments")}</legend>
      <p className="muted">{t("financeAttachmentsHelp")}</p>
      {generated && (
        <div className="generated-pdf-actions">
          <button
            className="button secondary"
            type="button"
            // One invoice PDF at a time: remove it to make a new one.
            disabled={generated.busy || hasPdf}
            onClick={() => {
              if (removedGeneratedIds.length) {
                onRemovedAttachmentIdsChange(
                  removedAttachmentIds.filter(
                    (id) => !removedGeneratedIds.includes(id),
                  ),
                );
                setRemovedGeneratedIds([]);
              }
              generated.onGenerate();
            }}
          >
            {generated.busy ? t("loading") : t("generateInvoicePdfAttach")}
          </button>
          <InfoTip text={t("generateInvoicePdfAttachTip")} />
        </div>
      )}
      {generated?.file && (
        <ul className="attachment-list pending-attachment-list">
          <li>
            <span>{generated.file.name}</span>
            <span className="detail-tag detail-tag-neutral">
              {t("generatedInvoicePdf")}
            </span>
            <PreviewButton
              name={generated.file.name}
              onClick={() =>
                setPreviewing({
                  name: generated.file!.name,
                  contentType: "application/pdf",
                  blob: generated.file!,
                })
              }
            />
            <button
              className="attachment-remove"
              type="button"
              aria-label={t("removeAttachment").replace(
                "{name}",
                generated.file.name,
              )}
              title={t("removeAttachment").replace(
                "{name}",
                generated.file.name,
              )}
              onClick={generated.onRemove}
            >
              <FileRemoveIcon />
            </button>
          </li>
        </ul>
      )}
      {generated?.stale && (
        <p className="notice notice-warning">{t("generatedInvoicePdfStale")}</p>
      )}
      {generated?.error && (
        <p className="notice notice-error">{generated.error}</p>
      )}
      {shownExisting.length > 0 && (
        <ul className="attachment-list editable-attachment-list">
          {shownExisting.map((attachment) => (
            <li key={attachment.id}>
              <span className="stored-attachment-name">{attachment.name}</span>
              {attachment.generated && (
                <span className="detail-tag detail-tag-neutral">
                  {t("generatedInvoicePdf")}
                </span>
              )}
              {ai && (
                <AiProcessButton
                  name={attachment.name}
                  busy={ai.busyKey === attachment.id}
                  disabled={ai.busyKey !== null}
                  processed={ai.processedKeys.includes(attachment.id)}
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
              <FilePreviewAction
                target={{
                  name: attachment.name,
                  contentType: attachment.contentType,
                  fileUrl: attachmentUrl(entityType, entityId!, attachment.id),
                }}
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
                      processed={ai.processedKeys.includes(key)}
                      onClick={() =>
                        ai.onProcess({ kind: "file", file }, key, file.name)
                      }
                    />
                  )}
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
      {previewing && (
        <FilePreviewModal
          target={previewing}
          onClose={() => setPreviewing(null)}
        />
      )}
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
                  if (confirmingRemoval.generated)
                    setRemovedGeneratedIds((ids) => [
                      ...ids,
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

/** A stored attachment's name followed by the eye icon. */
export function StoredAttachment({
  entityType,
  entityId,
  attachment,
}: {
  entityType: FinanceEntityType;
  entityId: string;
  attachment: { id: string; name: string; contentType: string };
}) {
  return (
    <FileName
      target={{
        name: attachment.name,
        contentType: attachment.contentType,
        fileUrl: attachmentUrl(entityType, entityId, attachment.id),
      }}
    />
  );
}

/**
 * A stored attachment as one paper clip icon for table cells: hovering shows
 * the file name and clicking opens the preview popup.
 */
export function AttachmentClip({
  entityType,
  entityId,
  attachment,
}: {
  entityType: FinanceEntityType;
  entityId: string;
  attachment: { id: string; name: string; contentType: string };
}) {
  return (
    <FileClip
      target={{
        name: attachment.name,
        contentType: attachment.contentType,
        fileUrl: attachmentUrl(entityType, entityId, attachment.id),
      }}
    />
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
    <DetailSection title={t("attachments")} count={items?.length}>
      {error ? (
        <p className="notice notice-error" role="alert">
          {t("financeError_attachmentLoadFailed")}
        </p>
      ) : items === null ? (
        <p className="muted">{t("loading")}</p>
      ) : items.length ? (
        <DetailFiles>
          {items.map((item) => (
            <DetailAttachment
              key={item.id}
              entityType={entityType}
              entityId={entityId}
              attachment={item}
            />
          ))}
        </DetailFiles>
      ) : (
        <p className="muted">{t("noAttachments")}</p>
      )}
    </DetailSection>
  );
}

/** A stored attachment as a file row in a detail popup. */
function DetailAttachment({
  entityType,
  entityId,
  attachment,
}: {
  entityType: FinanceEntityType;
  entityId: string;
  attachment: Attachment;
}) {
  return (
    <DetailFile
      name={attachment.name}
      contentType={attachment.contentType}
      size={attachment.size}
    >
      <FilePreviewAction
        target={{
          name: attachment.name,
          contentType: attachment.contentType,
          fileUrl: attachmentUrl(entityType, entityId, attachment.id),
        }}
      />
    </DetailFile>
  );
}
