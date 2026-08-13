"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { useLocale } from "@/components/localization/LocaleProvider";
import { appCheckFetch } from "@/lib/firebase/client";

export type ContractItem = {
  id: string;
  name: string;
  documentDate: string;
  ownerType: "company" | "consultant";
  consultantId: string | null;
  consultantName: string | null;
  visibleToConsultant: boolean;
  confidential: boolean;
  files: { id: string; name: string; size: number }[];
};

export function ContractList({
  contracts,
  canManage,
}: {
  contracts: ContractItem[];
  canManage: boolean;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [viewing, setViewing] = useState<ContractItem | null>(null);
  const [deleting, setDeleting] = useState<ContractItem | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function download(
    contractId: string,
    file: ContractItem["files"][number],
  ) {
    const response = await appCheckFetch(
      `/api/documents/contracts/${encodeURIComponent(contractId)}/files/${encodeURIComponent(file.id)}`,
    );
    if (!response.ok) return setError(t("contractDownloadFailed"));
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
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
        {canManage && (
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
      <section className="card table-wrap">
        {contracts.length === 0 ? (
          <div className="empty-state">
            <h2>{t("noContracts")}</h2>
            <p>{t("noContractsDescription")}</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("documentDate")}</th>
                <th>{t("name")}</th>
                <th>{t("documentOwner")}</th>
                <th>{t("confidential")}</th>
                <th>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract) => (
                <tr key={contract.id}>
                  <td>{contract.documentDate}</td>
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
                      {canManage && (
                        <>
                          <Link
                            className="table-action icon-action"
                            aria-label={t("edit")}
                            title={t("edit")}
                            href={`/documents/contracts/${contract.id}/edit`}
                          >
                            <ActionIcon type="edit" />
                          </Link>
                          <button
                            className="table-action icon-action danger"
                            aria-label={t("delete")}
                            title={t("delete")}
                            onClick={() => {
                              setDeleting(contract);
                              setConfirmation("");
                            }}
                          >
                            <ActionIcon type="delete" />
                          </button>
                        </>
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
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contract-view-title"
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow">{t("contractDetails")}</span>
                <h2 id="contract-view-title">{viewing.name}</h2>
              </div>
              <button
                className="modal-close"
                aria-label={t("close")}
                onClick={() => setViewing(null)}
              >
                ×
              </button>
            </header>
            <dl className="detail-list">
              <div>
                <dt>{t("documentDate")}</dt>
                <dd>{viewing.documentDate}</dd>
              </div>
              <div>
                <dt>{t("documentOwner")}</dt>
                <dd>
                  {viewing.ownerType === "company"
                    ? t("company")
                    : viewing.consultantName}
                </dd>
              </div>
              <div>
                <dt>{t("visibleToConsultant")}</dt>
                <dd>{viewing.visibleToConsultant ? t("yes") : t("no")}</dd>
              </div>
              <div>
                <dt>{t("confidential")}</dt>
                <dd>{viewing.confidential ? t("yes") : t("no")}</dd>
              </div>
            </dl>
            <h3>{t("files")}</h3>
            <ul className="attachment-list">
              {viewing.files.map((file) => (
                <li key={file.id}>
                  <span>{file.name}</span>
                  <button
                    className="text-link"
                    onClick={() => void download(viewing.id, file)}
                  >
                    {t("download")}
                  </button>
                </li>
              ))}
            </ul>
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
