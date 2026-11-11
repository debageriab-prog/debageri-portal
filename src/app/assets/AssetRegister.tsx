"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { ActionIcon } from "@/components/ui/ActionIcon";
import {
  activePurchaseValueMinor,
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  canEditAsset,
  filterAssets,
  type AssetCategory,
  type AssetStatus,
} from "@/domain/assets";
import { formatSek } from "@/domain/finance/calculations";
import { AssetStatusBadge, AssetTopbar, useHolderLabel } from "./AssetParts";
import type { AssetItem } from "./asset-types";

export function AssetRegister({
  assets,
  canManage,
}: {
  assets: AssetItem[];
  canManage: boolean;
}) {
  const { t, locale } = useLocale();
  const holderLabel = useHolderLabel();
  const [status, setStatus] = useState<AssetStatus | "all">("active");
  const [category, setCategory] = useState<AssetCategory | "all">("all");
  const [holder, setHolder] = useState("all");
  const [search, setSearch] = useState("");
  const people = useMemo(
    () =>
      Array.from(
        new Map(
          assets
            .filter((asset) => asset.holder.userId)
            .map((asset) => [asset.holder.userId!, asset.holder.name]),
        ),
      ).sort((a, b) => a[1].localeCompare(b[1])),
    [assets],
  );
  const filtered = filterAssets(assets, { status, category, holder, search });

  return (
    <>
      <AssetTopbar
        title={t("assetRegister")}
        description={t("assetRegisterDescription")}
      >
        {canManage && (
          <div className="actions">
            <Link className="button secondary" href="/assets/handovers/new">
              {t("handoverNew")}
            </Link>
            <Link className="button" href="/assets/new">
              {t("assetNew")}
            </Link>
          </div>
        )}
      </AssetTopbar>
      <section className="card filters-card">
        <div className="form-grid">
          <label>
            {t("assetSearch")}
            <input
              className="field"
              type="search"
              value={search}
              placeholder={t("assetSearchPlaceholder")}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            {t("assetCategory")}
            <select
              className="field"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as AssetCategory | "all")
              }
            >
              <option value="all">{t("assetAllCategories")}</option>
              {ASSET_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {t(`assetCategory_${item}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("assetHolder")}
            <select
              className="field"
              value={holder}
              onChange={(event) => setHolder(event.target.value)}
            >
              <option value="all">{t("assetAllHolders")}</option>
              <option value="company">{t("assetHolder_company")}</option>
              <option value="user">{t("assetHolder_user")}</option>
              <option value="external">{t("assetHolder_external")}</option>
              {people.map(([id, name]) => (
                <option key={id} value={`user:${id}`}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("status")}
            <select
              className="field"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as AssetStatus | "all")
              }
            >
              <option value="all">{t("allStatuses")}</option>
              {ASSET_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {t(`assetStatus_${item}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section className="card table-wrap">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <h2>{t("assetNone")}</h2>
            <p>{t("assetNoneDescription")}</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("assetName")}</th>
                <th>{t("assetReceiptMakeModel")}</th>
                <th>{t("assetSerialNumber")}</th>
                <th>{t("assetHolder")}</th>
                <th>{t("assetPurchaseDate")}</th>
                <th className="amount-heading">{t("assetPurchasePrice")}</th>
                <th>{t("status")}</th>
                <th className="actions-heading">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((asset) => (
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
                  <td>
                    {holderLabel(asset.holder)}
                    {asset.handoverStatus === "pending" && (
                      <div className="muted">
                        {t("assetAwaitingAcceptance")}
                      </div>
                    )}
                  </td>
                  <td>{asset.purchaseDate ?? "—"}</td>
                  <td className="amount-cell">
                    {formatSek(asset.purchasePriceMinor, locale)}
                  </td>
                  <td>
                    <AssetStatusBadge status={asset.status} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link
                        className="table-action icon-action"
                        aria-label={t("assetView")}
                        title={t("assetView")}
                        href={`/assets/${encodeURIComponent(asset.id)}`}
                      >
                        <span aria-hidden="true">i</span>
                      </Link>
                      {canManage && canEditAsset(asset) && (
                        <Link
                          className="table-action icon-action"
                          aria-label={t("assetEdit")}
                          title={t("assetEdit")}
                          href={`/assets/${encodeURIComponent(asset.id)}/edit`}
                        >
                          <ActionIcon type="edit" />
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>
                  <strong>{t("assetActiveValue")}</strong>
                </td>
                <td className="amount-cell">
                  <strong>
                    {formatSek(activePurchaseValueMinor(filtered), locale)}
                  </strong>
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        )}
      </section>
    </>
  );
}
