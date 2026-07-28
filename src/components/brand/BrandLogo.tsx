"use client";

import { useLocale } from "@/components/localization/LocaleProvider";

export function BrandLogo({
  compact = false,
  inverse = false,
}: {
  compact?: boolean;
  inverse?: boolean;
}) {
  const { t } = useLocale();
  return (
    <span
      className={`brand-logo ${compact ? "brand-logo-compact" : ""} ${inverse ? "brand-logo-inverse" : ""}`}
    >
      {/* Canonical artwork maintained in debageriab-prog/debageri-web. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- canonical cross-repository brand asset */}
      <img
        src="https://raw.githubusercontent.com/debageriab-prog/debageri-web/main/public/debageri.svg"
        alt="Debageri"
      />
      {!compact && <span>{t("employeePortal")}</span>}
    </span>
  );
}
