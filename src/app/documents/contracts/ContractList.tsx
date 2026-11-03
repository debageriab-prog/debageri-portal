"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { useLocale } from "@/components/localization/LocaleProvider";
import { appCheckFetch } from "@/lib/firebase/client";
import {
  DetailFacts,
  DetailFile,
  DetailFiles,
  DetailSection,
  DetailSections,
  DetailSummary,
  DetailTag,
} from "@/components/ui/DetailView";
import {
  contentTypeFromName,
  FilePreviewAction,
} from "@/components/ui/FilePreview";

export type ContractItem = {
  id: string;
  name: string;
  documentDate: string;
  validTo: string | null;
  ownerType: "company" | "consultant";
  consultantId: string | null;
  consultantName: string | null;
  visibleToConsultant: boolean;
  confidential: boolean;
  files: { id: string; name: string; size: number }[];
};

export const contractFileUrl = (contractId: string, fileId: string) =>
  `/api/documents/contracts/${encodeURIComponent(contractId)}/files/${encodeURIComponent(fileId)}`;

export function ContractList({
  contracts,
  canAdd,
  canEdit,
  canDelete,
  viewerIsConsultant,
}: {
  contracts: ContractItem[];
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  viewerIsConsultant: boolean;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [viewing, setViewing] = useState<ContractItem | null>(null);
  const [deleting, setDeleting] = useState<ContractItem | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [nameFilter, setNameFilter] = useState("");
  const [consultantFilter, setConsultantFilter] = useState("");
  const [showInvalid, setShowInvalid] = useState(false);
  const consultants = Array.from(
    new Map(
      contracts
        .filter((contract) => contract.consultantId)
        .map((contract) => [
          contract.consultantId!,
          contract.consultantName ?? t("consultant"),
        ]),
    ),
  ).sort((left, right) => left[1].localeCompare(right[1]));
  const filteredContracts = contracts.filter(
    (contract) =>
      (showInvalid || contract.validTo === null) &&
      contract.name
        .toLocaleLowerCase()
        .includes(nameFilter.toLocaleLowerCase()) &&
      (!consultantFilter || contract.consultantId === consultantFilter),
  );
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    const response = await appCheckFetch(
      `/api/documents/contracts/${encodeURIComponent(deleting.id)}`,
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation }),
      },
    );
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setBusy(false);
    if (!response.ok)
      return setError(
        result.error === "confirmationRequired"
          ? t("contractError_confirmationRequired")
          : t("contractError_contractDeleteFailed"),
      );
    setDeleting(null);
    setConfirmation("");
    router.refresh();
  }
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("documents")}</div>
          <h1>{t("contracts")}</h1>
          <p className="muted page-description">{t("contractsDescription")}</p>
        </div>
        {canAdd && (
          <Link className="button" href="/documents/contracts/new">
            {t("addContract")}
          </Link>
        )}
      </div>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      <section className="card filters-card">
        <div className="form-grid">
          <label>
            {t("filterDocumentName")}
            <input
              className="field"
              type="search"
              value={nameFilter}
              placeholder={t("filterDocumentNamePlaceholder")}
              onChange={(event) => setNameFilter(event.target.value)}
            />
          </label>
          {!viewerIsConsultant && (
            <label>
              {t("filterConsultant")}
              <select
                className="field"
                value={consultantFilter}
                onChange={(event) => setConsultantFilter(event.target.value)}
              >
                <option value="">{t("allConsultants")}</option>
                {consultants.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="checkbox-row form-wide">
            <input
              type="checkbox"
              checked={showInvalid}
              onChange={(event) => setShowInvalid(event.target.checked)}
            />
            <span>
              <strong>{t("showInvalidDocuments")}</strong>
            </span>
          </label>
        </div>
      </section>
      <section className="card table-wrap">
        {filteredContracts.length === 0 ? (
          <div className="empty-state">
            <h2>{t("noContracts")}</h2>
            <p>{t("noContractsDescription")}</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("documentDate")}</th>
                <th>{t("validTo")}</th>
                <th>{t("name")}</th>
                <th>{t("documentOwner")}</th>
                <th>{t("confidential")}</th>
                <th>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredContracts.map((contract) => (
                <tr key={contract.id}>
                  <td>{contract.documentDate}</td>
                  <td>{contract.validTo ?? t("noEndDate")}</td>
                  <td>
                    <strong>{contract.name}</strong>
                  </td>
                  <td>
                    {contract.ownerType === "company"
                      ? t("company")
                      : contract.consultantName}
                  </td>
                  <td>{contract.confidential ? t("yes") : t("no")}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="table-action icon-action"
                        aria-label={t("viewDetails")}
                        title={t("viewDetails")}
                        onClick={() => setViewing(contract)}
                      >
                        <span aria-hidden="true">i</span>
                      </button>
                      {canEdit && (
                        <Link
                          className="table-action icon-action"
                          aria-label={t("edit")}
                          title={t("edit")}
                          href={`/documents/contracts/${contract.id}/edit`}
                        >
                          <ActionIcon type="edit" />
                        </Link>
                      )}
                      {canDelete && (
                        <button
                          className="table-action table-action-danger icon-action"
                          aria-label={t("delete")}
                          title={t("delete")}
                          onClick={() => {
                            setDeleting(contract);
                            setConfirmation("");
                          }}
                        >
                          <ActionIcon type="delete" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {viewing && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setViewing(null)}
        >
          <section
            className="modal detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contract-view-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow">{t("contractDetails")}</span>
                <h2 id="contract-view-title">{viewing.name}</h2>
                <p>
                  {viewing.ownerType === "company"
                    ? t("company")
                    : viewing.consultantName}
                </p>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label={t("close")}
                onClick={() => setViewing(null)}
              >
                ×
              </button>
            </header>
            {viewing.confidential && (
              <aside className="notice notice-warning contract-confidential-notice">
                <strong>{t("confidentialDocumentNoticeTitle")}</strong>
                <span>{t("confidentialDocumentNotice")}</span>
              </aside>
            )}
            <DetailSummary
              tone={viewing.confidential ? "negative" : "neutral"}
              tags={
                <>
                  <DetailTag>
                    {viewing.ownerType === "company"
                      ? t("company")
                      : viewing.consultantName}
                  </DetailTag>
                  {viewing.confidential && (
                    <DetailTag tone="negative">{t("confidential")}</DetailTag>
                  )}
                  {!viewerIsConsultant && viewing.visibleToConsultant && (
                    <DetailTag tone="positive">
                      {t("visibleToConsultant")}
                    </DetailTag>
                  )}
                </>
              }
              headline={`${viewing.documentDate} \u2013 ${viewing.validTo ?? t("noEndDate")}`}
            />
            <DetailSections>
              <DetailSection title={t("detailDetails")}>
                <DetailFacts
                  rows={[
                    [t("documentDate"), viewing.documentDate],
                    [t("validTo"), viewing.validTo ?? t("noEndDate")],
                    [
                      t("documentOwner"),
                      viewing.ownerType === "company"
                        ? t("company")
                        : viewing.consultantName,
                    ],
                    !viewerIsConsultant && [
                      t("visibleToConsultant"),
                      viewing.visibleToConsultant ? t("yes") : t("no"),
                    ],
                    [
                      t("confidential"),
                      viewing.confidential ? t("yes") : t("no"),
                    ],
                  ]}
                />
              </DetailSection>
              <DetailSection title={t("files")} count={viewing.files.length}>
                <DetailFiles>
                  {viewing.files.map((file) => (
                    <DetailFile key={file.id} name={file.name} size={file.size}>
                      <FilePreviewAction
                        target={{
                          name: file.name,
                          contentType: contentTypeFromName(file.name),
                          fileUrl: contractFileUrl(viewing.id, file.id),
                        }}
                      />
                    </DetailFile>
                  ))}
                </DetailFiles>
              </DetailSection>
            </DetailSections>
          </section>
        </div>
      )}
      {deleting && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="contract-delete-title"
          >
            <header className="modal-header">
              <div>
                <h2 id="contract-delete-title">{t("deleteContract")}</h2>
                <p>
                  {t("deleteContractDescription").replace(
                    "{name}",
                    deleting.name,
                  )}
                </p>
              </div>
            </header>
            <label>
              {t("typeDeleteConfirmation").replace(
                "{phrase}",
                t("deleteConfirmationPhrase"),
              )}
              <input
                className="field"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoFocus
              />
            </label>
            <footer className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setDeleting(null)}
              >
                {t("cancel")}
              </button>
              <button
                className="button danger"
                disabled={
                  busy || confirmation !== t("deleteConfirmationPhrase")
                }
                onClick={() => void remove()}
              >
                {busy ? t("deleting") : t("delete")}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
