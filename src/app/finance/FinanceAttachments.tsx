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

  const remaining = Math.max(0, 3 - existing.length);
  return (
    <fieldset className="form-wide attachment-fieldset">
      <legend>{t("attachments")}</legend>
      <p className="muted">{t("financeAttachmentsHelp")}</p>
      {existing.length > 0 && (
        <ul className="attachment-list">
          {existing.map((attachment) => (
            <li key={attachment.id}>
              <a
                className="text-link"
                href={`/api/finance/attachments/${entityType}/${encodeURIComponent(entityId!)}/${attachment.id}`}
              >
                {attachment.name}
              </a>
              <button
                className="table-action table-action-danger"
                type="button"
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
                {t("remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
      {remaining > 0 && (
        <input
          className="field"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          multiple
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []).slice(
              0,
              remaining,
            );
            onFilesChange(selected);
          }}
        />
      )}
      {files.length > 0 && (
        <p className="muted">
          {t("filesSelected").replace("{count}", String(files.length))}
        </p>
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
              <a
                className="text-link"
                href={`/api/finance/attachments/${entityType}/${encodeURIComponent(entityId)}/${item.id}`}
              >
                {item.name}
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
