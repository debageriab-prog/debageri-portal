"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { appCheckFetch } from "@/lib/firebase/client";
import {
  FileDownloadIcon,
  FileRemoveIcon,
} from "@/components/ui/FileActionIcons";
import type { ContractItem } from "./ContractList";

type Consultant = { id: string; name: string };
export function ContractForm({
  consultants,
  contract,
}: {
  consultants: Consultant[];
  contract?: ContractItem;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [ownerType, setOwnerType] = useState<"company" | "consultant">(
    contract?.ownerType ?? "company",
  );
  const [files, setFiles] = useState<File[]>([]);
  const [existing, setExisting] = useState(contract?.files ?? []);
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download(file: ContractItem["files"][number]) {
    if (!contract) return;
    const response = await appCheckFetch(
      `/api/documents/contracts/${encodeURIComponent(contract.id)}/files/${encodeURIComponent(file.id)}`,
    );
    if (!response.ok) return setError(t("contractDownloadFailed"));
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const body = new FormData(event.currentTarget);
    body.set("ownerType", ownerType);
    body.set(
      "visibleToConsultant",
      String(
        ownerType === "consultant" && body.get("visibleToConsultant") === "on",
      ),
    );
    body.set("confidential", String(body.get("confidential") === "on"));
    body.set("removedFileIds", JSON.stringify(removed));
    files.forEach((file) => body.append("files", file));
    const url = contract
      ? `/api/documents/contracts/${encodeURIComponent(contract.id)}`
      : "/api/documents/contracts";
    const response = await appCheckFetch(url, {
      method: contract ? "PATCH" : "POST",
      body,
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setBusy(false);
    if (!response.ok) {
      const errors = {
        invalidInput: t("contractError_invalidInput"),
        invalidConsultant: t("contractError_invalidConsultant"),
        contractFilesRequired: t("contractError_contractFilesRequired"),
        contractFileLimit: t("contractError_contractFileLimit"),
        contractFileTooLarge: t("contractError_contractFileTooLarge"),
        contractFileType: t("contractError_contractFileType"),
      } as Record<string, string>;
      return setError(
        errors[result.error ?? ""] ?? t("contractError_contractSaveFailed"),
      );
    }
    router.push("/documents/contracts");
    router.refresh();
  }
  return (
    <form className="card form-card" onSubmit={submit}>
      <div className="form-grid">
        <label>
          {t("documentName")}
          <input
            className="field"
            name="name"
            defaultValue={contract?.name}
            required
            autoFocus
            maxLength={180}
          />
        </label>
        <label>
          {t("documentDate")}
          <input
            className="field"
            name="documentDate"
            type="date"
            defaultValue={
              contract?.documentDate ?? new Date().toISOString().slice(0, 10)
            }
            required
          />
        </label>
        <label>
          {t("validTo")}
          <input
            className="field"
            name="validTo"
            type="date"
            defaultValue={contract?.validTo ?? ""}
          />
          <small>{t("contractValidToHelp")}</small>
        </label>
        <label>
          {t("documentOwner")}
          <select
            className="field"
            value={ownerType}
            onChange={(event) =>
              setOwnerType(event.target.value as "company" | "consultant")
            }
          >
            <option value="company">{t("company")}</option>
            <option value="consultant">{t("consultant")}</option>
          </select>
        </label>
        {ownerType === "consultant" && (
          <label>
            {t("consultant")}
            <select
              className="field"
              name="consultantId"
              defaultValue={contract?.consultantId ?? ""}
              required
            >
              <option value="">{t("selectConsultant")}</option>
              {consultants.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {ownerType === "consultant" && (
          <label className="checkbox-row form-wide">
            <input
              name="visibleToConsultant"
              type="checkbox"
              defaultChecked={contract?.visibleToConsultant}
            />
            <span>
              <strong>{t("visibleToConsultant")}</strong>
              <small>{t("visibleToConsultantHelp")}</small>
            </span>
          </label>
        )}
        <label className="checkbox-row form-wide">
          <input
            name="confidential"
            type="checkbox"
            defaultChecked={contract?.confidential}
          />
          <span>
            <strong>{t("confidential")}</strong>
            <small>{t("confidentialHelp")}</small>
          </span>
        </label>
        <fieldset className="attachment-fieldset form-wide">
          <legend>{t("files")}</legend>
          <p className="muted">{t("contractFilesHelp")}</p>
          {existing.length > 0 && (
            <ul className="attachment-list editable-attachment-list">
              {existing.map((file) => (
                <li key={file.id}>
                  <span>{file.name}</span>
                  <button
                    type="button"
                    className="attachment-download"
                    aria-label={t("downloadAttachment").replace(
                      "{name}",
                      file.name,
                    )}
                    title={t("downloadAttachment").replace("{name}", file.name)}
                    onClick={() => void download(file)}
                  >
                    <FileDownloadIcon />
                  </button>
                  <button
                    type="button"
                    className="attachment-remove"
                    aria-label={t("removeAttachment").replace(
                      "{name}",
                      file.name,
                    )}
                    title={t("removeAttachment").replace("{name}", file.name)}
                    onClick={() => {
                      setExisting((items) =>
                        items.filter((item) => item.id !== file.id),
                      );
                      setRemoved((ids) => [...ids, file.id]);
                    }}
                  >
                    <FileRemoveIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            className="field"
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.txt"
            onChange={(event) => {
              const selected = Array.from(event.currentTarget.files ?? []);
              setFiles((items) => [...items, ...selected].slice(0, 10));
              event.currentTarget.value = "";
            }}
          />
          {files.length > 0 && (
            <ul className="attachment-list pending-attachment-list">
              {files.map((file, index) => (
                <li key={`${file.name}-${file.lastModified}`}>
                  <span>{file.name}</span>
                  <button
                    type="button"
                    className="attachment-remove"
                    aria-label={t("removeAttachment").replace(
                      "{name}",
                      file.name,
                    )}
                    title={t("removeAttachment").replace("{name}", file.name)}
                    onClick={() =>
                      setFiles((items) => items.filter((_, i) => i !== index))
                    }
                  >
                    <FileRemoveIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      </div>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      <footer className="modal-actions">
        <button
          type="button"
          className="button secondary"
          onClick={() => router.push("/documents/contracts")}
        >
          {t("cancel")}
        </button>
        <button
          className="button"
          disabled={busy || existing.length + files.length === 0}
        >
          {busy ? t("saving") : t("save")}
        </button>
      </footer>
    </form>
  );
}
