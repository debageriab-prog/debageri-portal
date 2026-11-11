"use client";

import { useLocale } from "@/components/localization/LocaleProvider";
import type { AssetHolder, AssetStatus, HandoverStatus } from "@/domain/assets";

const statusClass: Record<AssetStatus, string> = {
  active: " status-active",
  sold: " status-approved",
  disposed: " status-inactive",
  lost: " status-rejected",
};

const handoverClass: Record<HandoverStatus, string> = {
  pending: " status-changes",
  accepted: " status-approved",
  cancelled: " status-inactive",
  returned: " status-inactive",
};

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  const { t } = useLocale();
  return (
    <span className={`status${statusClass[status]}`}>
      {t(`assetStatus_${status}`)}
    </span>
  );
}

export function HandoverStatusBadge({ status }: { status: HandoverStatus }) {
  const { t } = useLocale();
  return (
    <span className={`status${handoverClass[status]}`}>
      {t(`handoverStatus_${status}`)}
    </span>
  );
}

/** "Anna Svensson", "Company (Gothenburg office)" or "Erik (outside the portal)". */
export function useHolderLabel() {
  const { t } = useLocale();
  return (holder: AssetHolder) => {
    const where = holder.location ? ` (${holder.location})` : "";
    if (holder.type === "company") return `${t("assetHolder_company")}${where}`;
    if (holder.type === "external")
      return `${holder.name} · ${t("assetHolder_external")}${where}`;
    return `${holder.name}${where}`;
  };
}

/** The page header every asset page shares. */
export function AssetTopbar({
  title,
  description,
  eyebrow,
  children,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  const { t } = useLocale();
  return (
    <div className="topbar">
      <div>
        <div className="eyebrow">{eyebrow ?? t("assets")}</div>
        <h1>{title}</h1>
        {description && <p className="muted page-description">{description}</p>}
      </div>
      {children}
    </div>
  );
}
