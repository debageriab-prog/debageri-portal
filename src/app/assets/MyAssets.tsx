"use client";

import { partsSummary } from "@/domain/assets";
import Link from "next/link";
import { useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { FilePreviewModal } from "@/components/ui/FilePreview";
import { AssetTopbar, HandoverStatusBadge } from "./AssetParts";
import {
  handoverPdfUrl,
  type AssetItem,
  type HandoverItem,
} from "./asset-types";

/** One row: an asset I hold with its receipt, or an older receipt. */
type Row = {
  key: string;
  name: string;
  category: string;
  makeModel: string;
  more: number;
  serialNumber: string;
  accessories: string;
  handover: HandoverItem | null;
};

const join = (values: string[]) => values.filter(Boolean).join(", ");

export function MyAssets({
  assets,
  handovers,
}: {
  assets: AssetItem[];
  handovers: HandoverItem[];
}) {
  const { t } = useLocale();
  const pending = handovers.filter((handover) => handover.status === "pending");
  const held = new Set(assets.map((asset) => asset.activeHandoverId));
  const rows: Row[] = [
    ...assets.map((asset) => {
      const summary = partsSummary(asset.parts);
      return {
        key: asset.id,
        name: asset.name,
        category: t(`assetCategory_${asset.category}`),
        makeModel: summary.makeModel,
        more: summary.more,
        serialNumber: summary.serialNumber,
        accessories: join(asset.parts.map((part) => part.accessories)),
        handover:
          handovers.find(
            (handover) => handover.id === asset.activeHandoverId,
          ) ?? null,
      };
    }),
    // Receipts for equipment I no longer hold, such as returned ones.
    ...handovers
      .filter((handover) => !held.has(handover.id))
      .map((handover) => ({
        key: handover.id,
        name: join(handover.lines.map((line) => line.equipment)),
        category: "",
        makeModel: join(handover.lines.map((line) => line.makeModel)),
        more: 0,
        serialNumber: join(handover.lines.map((line) => line.serialNumber)),
        accessories: join(handover.lines.map((line) => line.accessories)),
        handover,
      })),
  ];

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
        {rows.length === 0 ? (
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
                <th>{t("handoverIssuedOn")}</th>
                <th>{t("status")}</th>
                <th className="actions-heading">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <strong>{row.name}</strong>
                    {row.category && (
                      <div className="muted">{row.category}</div>
                    )}
                  </td>
                  <td>
                    {row.makeModel || "—"}
                    {row.more > 0 && (
                      <div className="muted">
                        {t("assetPartsMore").replace(
                          "{count}",
                          String(row.more),
                        )}
                      </div>
                    )}
                  </td>
                  <td>{row.serialNumber || "—"}</td>
                  <td>{row.accessories || "—"}</td>
                  <td>{row.handover?.issuedOn ?? "—"}</td>
                  <td>
                    {row.handover ? (
                      <HandoverStatusBadge status={row.handover.status} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {row.handover && (
                      <div className="row-actions">
                        <Link
                          className="table-action icon-action"
                          aria-label={t("handoverOpen")}
                          title={t("handoverOpen")}
                          href={`/assets/handovers/${encodeURIComponent(row.handover.id)}`}
                        >
                          <span aria-hidden="true">i</span>
                        </Link>
                        <HandoverPdfButton handover={row.handover} />
                      </div>
                    )}
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

/** The PDF icon that opens a receipt in the shared preview popup. */
function HandoverPdfButton({ handover }: { handover: HandoverItem }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const name = `${t("assetHandoverDocument")
    .replace("{name}", handover.recipientName)
    .replace("{date}", handover.issuedOn)}.pdf`;
  return (
    <>
      <button
        className="table-action icon-action"
        type="button"
        aria-label={t("handoverViewPdf")}
        title={t("handoverViewPdf")}
        onClick={() => setOpen(true)}
      >
        <ActionIcon type="pdf" />
      </button>
      {open && (
        <FilePreviewModal
          target={{
            name,
            contentType: "application/pdf",
            fileUrl: handoverPdfUrl(handover.id),
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
