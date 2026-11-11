"use client";

import Link from "next/link";
import { useLocale } from "@/components/localization/LocaleProvider";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { AssetTopbar, HandoverStatusBadge } from "./AssetParts";
import {
  handoverPdfUrl,
  type AssetItem,
  type HandoverItem,
} from "./asset-types";

export function MyAssets({
  assets,
  handovers,
}: {
  assets: AssetItem[];
  handovers: HandoverItem[];
}) {
  const { t } = useLocale();
  const pending = handovers.filter((handover) => handover.status === "pending");
  return (
    <>
      <AssetTopbar
        title={t("myAssets")}
        description={t("myAssetsDescription")}
      />
      {pending.length > 0 && (
        <div className="notice notice-warning" role="status">
          <strong>{t("handoverPleaseAccept")}</strong>
          <ul className="request-link-list">
            {pending.map((handover) => (
              <li key={handover.id}>
                <Link
                  href={`/assets/handovers/${encodeURIComponent(handover.id)}`}
                >
                  {handover.lines.map((line) => line.equipment).join(", ")} (
                  {handover.issuedOn})
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <section className="card table-wrap">
        {assets.length === 0 ? (
          <div className="empty-state">
            <h2>{t("myAssetsNone")}</h2>
            <p>{t("myAssetsNoneDescription")}</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("assetName")}</th>
                <th>{t("assetReceiptMakeModel")}</th>
                <th>{t("assetSerialNumber")}</th>
                <th>{t("assetAccessories")}</th>
                <th>{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id}>
                  <td>
                    <strong>{asset.name}</strong>
                    <div className="muted">
                      {t(`assetCategory_${asset.category}`)}
                    </div>
                  </td>
                  <td>
                    {[asset.make, asset.model].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td>{asset.serialNumber || "—"}</td>
                  <td>{asset.accessories || "—"}</td>
                  <td>
                    {asset.handoverStatus ? (
                      <HandoverStatusBadge status={asset.handoverStatus} />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {handovers.length > 0 && (
        <section className="card table-wrap">
          <h2>{t("handovers")}</h2>
          <table>
            <thead>
              <tr>
                <th>{t("handoverIssuedOn")}</th>
                <th>{t("assetReceiptIssuedEquipment")}</th>
                <th>{t("status")}</th>
                <th className="actions-heading">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {handovers.map((handover) => (
                <tr key={handover.id}>
                  <td>{handover.issuedOn}</td>
                  <td>
                    {handover.lines.map((line) => line.equipment).join(", ")}
                  </td>
                  <td>
                    <HandoverStatusBadge status={handover.status} />
                  </td>
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
        </section>
      )}
    </>
  );
}
