"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { DateInput } from "@/components/ui/DateInput";
import { FileRemoveIcon } from "@/components/ui/FileActionIcons";
import { InfoTip } from "@/components/ui/InfoTip";
import { parseSek } from "@/domain/finance/calculations";
import {
  DATED_REQUEST_TYPES,
  isRequestContentType,
  isSafeLink,
  REQUEST_MAX_BYTES,
  REQUEST_MAX_FILES,
  REQUEST_MAX_LINKS,
  REQUEST_PAYERS,
  type RequestPayer,
  type RequestType,
} from "@/domain/requests";
import { appCheckFetch } from "@/lib/firebase/client";
import type { MessageKey } from "@/lib/localization/messages";
import type { RequestFileItem, RequestItem } from "./RequestParts";

const errors: Record<string, MessageKey> = {
  invalidInput: "requestError_invalidInput",
  typeNotAllowed: "requestError_typeNotAllowed",
  requestFileTooLarge: "requestError_requestFileTooLarge",
  requestFileType: "requestError_requestFileType",
  requestFileEmpty: "requestError_requestFileType",
  requestTooManyFiles: "requestError_requestTooManyFiles",
  requestLocked: "requestError_requestLocked",
};

export function RequestForm({
  types,
  request,
}: {
  /** The request types this person may ask for. */
  types: RequestType[];
  /** The request being edited; a new request when left out. */
  request?: RequestItem;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [type, setType] = useState<RequestType | "">(
    request?.type ?? (types.length === 1 ? types[0]! : ""),
  );
  const [payer, setPayer] = useState<RequestPayer>(request?.payer ?? "company");
  const [cost, setCost] = useState(
    request ? (request.estimatedCostMinor / 100).toFixed(2) : "",
  );
  const [links, setLinks] = useState<string[]>(
    request?.links.length ? request.links : [""],
  );
  const [kept, setKept] = useState<RequestFileItem[]>(request?.files ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dated = type !== "" && DATED_REQUEST_TYPES.includes(type);
  const fileRoom = REQUEST_MAX_FILES - kept.length - files.length;
  const backHref = "/requests?mine=1";

  function addFiles(selected: File[]) {
    setError("");
    if (selected.length > fileRoom) {
      setError(t("requestError_requestTooManyFiles"));
      return false;
    }
    if (selected.some((file) => !isRequestContentType(file.type))) {
      setError(t("requestError_requestFileType"));
      return false;
    }
    if (selected.some((file) => file.size > REQUEST_MAX_BYTES)) {
      setError(t("requestError_requestFileTooLarge"));
      return false;
    }
    setFiles((current) => [...current, ...selected]);
    return true;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!type) return setError(t("requestError_typeRequired"));
    let costMinor: number;
    try {
      costMinor = cost.trim() ? parseSek(cost) : 0;
    } catch {
      return setError(t("requestError_invalidCost"));
    }
    if (costMinor < 0) return setError(t("requestError_invalidCost"));
    const cleanLinks = links.map((link) => link.trim()).filter(Boolean);
    if (!cleanLinks.every(isSafeLink))
      return setError(t("requestError_invalidLink"));
    const form = new FormData(event.currentTarget);
    const startDate = dated ? String(form.get("startDate") ?? "") : "";
    const endDate = dated ? String(form.get("endDate") ?? "") : "";
    if (startDate && endDate && endDate < startDate)
      return setError(t("requestError_endBeforeStart"));
    const body = new FormData();
    body.set("type", type);
    body.set("title", String(form.get("title") ?? ""));
    body.set("description", String(form.get("description") ?? ""));
    body.set("estimatedCostMinor", String(costMinor));
    body.set("payer", payer);
    body.set("startDate", startDate);
    body.set("endDate", endDate);
    for (const link of cleanLinks) body.append("links", link);
    for (const file of kept) body.append("keepFileIds", file.id);
    for (const file of files) body.append("files", file);
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch(
        request
          ? `/api/requests/${encodeURIComponent(request.id)}`
          : "/api/requests",
        { method: request ? "PUT" : "POST", body },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        return setError(
          t(errors[result.error ?? ""] ?? "requestError_requestSaveFailed"),
        );
      router.push(request ? `${backHref}&saved=1` : `${backHref}&submitted=1`);
      router.refresh();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <div className="form-grid">
        <label>
          {t("requestType")}
          <select
            className="field"
            name="type"
            required
            value={type}
            onChange={(event) => setType(event.target.value as RequestType)}
          >
            <option value="">{t("select")}</option>
            {types.map((item) => (
              <option key={item} value={item}>
                {t(`requestType_${item}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("requestTitle")}
          <input
            className="field"
            name="title"
            required
            maxLength={120}
            autoFocus
            defaultValue={request?.title}
            placeholder={t("requestTitlePlaceholder")}
          />
        </label>
        <label>
          {t("requestEstimatedCostSek")}
          <InfoTip text={t("requestEstimatedCostTip")} />
          <input
            className="field"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
            required
          />
        </label>
        <fieldset className="receipt-decision">
          <legend>
            {t("requestPayer")} <InfoTip text={t("requestPayerTip")} />
          </legend>
          {REQUEST_PAYERS.map((value) => (
            <label className="checkbox-row" key={value}>
              <input
                type="radio"
                name="payer"
                value={value}
                checked={payer === value}
                onChange={() => setPayer(value)}
              />
              <span>{t(`requestPayer_${value}`)}</span>
            </label>
          ))}
        </fieldset>
        {dated && (
          <>
            <label>
              {t("requestStartDateOptional")}
              <DateInput
                className="field"
                name="startDate"
                defaultValue={request?.startDate ?? ""}
              />
            </label>
            <label>
              {t("requestEndDateOptional")}
              <DateInput
                className="field"
                name="endDate"
                defaultValue={request?.endDate ?? ""}
              />
            </label>
          </>
        )}
        <label className="form-wide">
          {t("requestDescription")}
          <textarea
            className="field"
            name="description"
            rows={4}
            maxLength={2000}
            defaultValue={request?.description}
            placeholder={t("requestDescriptionPlaceholder")}
          />
        </label>
        <fieldset className="attachment-fieldset form-wide request-links">
          <legend>
            {t("requestLinksOptional")} <InfoTip text={t("requestLinksTip")} />
          </legend>
          {links.map((link, index) => (
            <div className="request-link-row" key={index}>
              <input
                className="field"
                type="url"
                inputMode="url"
                maxLength={500}
                placeholder="https://"
                aria-label={t("requestLinkNumber").replace(
                  "{number}",
                  String(index + 1),
                )}
                value={link}
                onChange={(event) =>
                  setLinks((current) =>
                    current.map((item, position) =>
                      position === index ? event.target.value : item,
                    ),
                  )
                }
              />
              {links.length > 1 && (
                <button
                  type="button"
                  className="attachment-remove"
                  aria-label={t("requestRemoveLink")}
                  title={t("requestRemoveLink")}
                  onClick={() =>
                    setLinks((current) =>
                      current.filter((_, position) => position !== index),
                    )
                  }
                >
                  <FileRemoveIcon />
                </button>
              )}
            </div>
          ))}
          {links.length < REQUEST_MAX_LINKS && (
            <button
              type="button"
              className="button secondary"
              onClick={() => setLinks((current) => [...current, ""])}
            >
              {t("requestAddLink")}
            </button>
          )}
        </fieldset>
        <fieldset className="attachment-fieldset form-wide">
          <legend>
            {t("requestFilesOptional")} <InfoTip text={t("requestFilesTip")} />
          </legend>
          {kept.length + files.length > 0 && (
            <ul className="attachment-list pending-attachment-list">
              {kept.map((file) => (
                <li key={file.id}>
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
                      setKept((current) =>
                        current.filter((item) => item.id !== file.id),
                      )
                    }
                  >
                    <FileRemoveIcon />
                  </button>
                </li>
              ))}
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`}>
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
                      setFiles((current) =>
                        current.filter((_, position) => position !== index),
                      )
                    }
                  >
                    <FileRemoveIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {fileRoom > 0 && (
            <input
              className="field"
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(event) => {
                const selected = Array.from(event.currentTarget.files ?? []);
                addFiles(selected);
                event.currentTarget.value = "";
              }}
            />
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
          onClick={() => router.push(backHref)}
        >
          {t("cancel")}
        </button>
        <button className="button" disabled={busy || types.length === 0}>
          {busy ? t("saving") : request ? t("saveChanges") : t("sendRequest")}
        </button>
      </footer>
    </form>
  );
}
