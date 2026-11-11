"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { HANDOVER_STATUSES, type HandoverStatus } from "@/domain/assets";
import { AssetTopbar, HandoverStatusBadge } from "./AssetParts";
import { handoverPdfUrl, type HandoverItem } from "./asset-types";

export function HandoverList({
  handovers,
  canManage,
  issued,
}: {
  handovers: HandoverItem[];
  canManage: boolean;
  issued: boolean;
}) {
  const { t } = useLocale();
  const [status, setStatus] = useState<HandoverStatus | "all">("all");
  const filtered = handovers.filter(
    (handover) => status === "all" || handover.status === status,
  );
  return (
    <>
      <AssetTopbar
        title={t("handovers")}
        description={t("handoversDescription")}
      >
        {canManage && (
          <Link className="button" href="/assets/handovers/new">
            {t("handoverNew")}
          </Link>
        )}
      </AssetTopbar>
      {issued && (
        <p className="notice notice-success" role="status">
          {t("handoverIssued")}
        </p>
      )}
      <section className="card filters-card">
        <div className="form-grid">
          <label>
            {t("status")}
            <select
              className="field"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as HandoverStatus | "all")
              }
            >
              <option value="all">{t("allStatuses")}</option>
              {HANDOVER_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {t(`handoverStatus_${item}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section className="card table-wrap">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <h2>{t("handoverNone")}</h2>
            <p>{t("handoverNoneDescription")}</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("handoverIssuedOn")}</th>
                <th>{t("assetReceiptRecipient")}</th>
                <th>{t("assetReceiptIssuedEquipment")}</th>
                <th>{t("status")}</th>
                <th>{t("handoverAcceptedOn")}</th>
                <th className="actions-heading">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((handover) => (
                <tr key={handover.id}>
                  <td>{handover.issuedOn}</td>
                  <td>
                    <strong>{handover.recipientName}</strong>
                  </td>
                  <td>
                    {handover.lines.map((line) => line.equipment).join(", ")}
                  </td>
                  <td>
                    <HandoverStatusBadge status={handover.status} />
                  </td>
                  <td>{handover.acceptedOn ?? "—"}</td>
                  <td>
                    <div className="row-actions">
                      <Link
                        className="table-action icon-action"
                        aria-label={t("handoverOpen")}
                        title={t("handoverOpen")}
                        href={`/assets/handovers/${encodeURIComponent(handover.id)}`}
                      >
                        <span aria-hidden="true">i</span>
                      </Link>
                      <a
                        className="table-action icon-action"
                        aria-label={t("handoverDownloadPdf")}
                        title={t("handoverDownloadPdf")}
                        href={handoverPdfUrl(handover.id)}
                      >
                        <ActionIcon type="pdf" />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
