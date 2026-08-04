"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { appCheckFetch } from "@/lib/firebase/client";

export type FinanceEntityType = "transaction" | "vatSettlement";
type Attachment = {
  id: string;
  name: string;
  size: number;
  contentType: string;
};

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

export function FinanceAttachments({
  entityType,
  entityId,
  files,
  onFilesChange,
}: {
  entityType: FinanceEntityType;
  entityId?: string;
  files: File[];
  onFilesChange(files: File[]): void;
}) {
  const { t } = useLocale();
  const [existing, setExisting] = useState<Attachment[]>([]);
  const [error, setError] = useState("");

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
              <a
                className="text-link"
                href={`/api/finance/attachments/${entityType}/${encodeURIComponent(entityId!)}/${attachment.id}`}
              >
                {attachment.name}
              </a>
              <button
                className="attachment-remove"
                type="button"
                aria-label={t("removeAttachment").replace(
                  "{name}",
                  attachment.name,
                )}
                title={t("removeAttachment").replace("{name}", attachment.name)}
                onClick={async () => {
                  setError("");
                  const response = await appCheckFetch(
                    `/api/finance/attachments/${entityType}/${encodeURIComponent(entityId!)}/${attachment.id}`,
                    { method: "DELETE" },
                  );
                  if (response.ok)
                    setExisting((items) =>
                      items.filter((item) => item.id !== attachment.id),
                    );
                  else setError(t("financeError_attachmentDeleteFailed"));
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
              <a
                className="attachment-download"
                href={`/api/finance/attachments/${entityType}/${encodeURIComponent(entityId)}/${item.id}`}
                aria-label={t("downloadAttachment").replace(
                  "{name}",
                  item.name,
                )}
                title={t("downloadAttachment").replace("{name}", item.name)}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                >
                  <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14" />
                </svg>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t("noAttachments")}</p>
      )}
    </div>
  );
}
