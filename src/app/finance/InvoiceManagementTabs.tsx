"use client";

import Link from "next/link";
import { useLocale } from "@/components/localization/LocaleProvider";

/** Invoices and invoice articles, the two tabs of invoice management. */
export function InvoiceManagementTabs({
  active,
  showInvoices,
  showArticles,
}: {
  active: "invoices" | "articles";
  showInvoices: boolean;
  showArticles: boolean;
}) {
  const { t } = useLocale();
  const tabs = [
    showInvoices && {
      id: "invoices",
      label: t("invoices"),
      href: "/finance?section=invoices",
    },
    showArticles && {
      id: "articles",
      label: t("invoiceArticles"),
      href: "/finance?section=articles",
    },
  ].filter(Boolean) as Array<{ id: string; label: string; href: string }>;
  if (tabs.length < 2) return null;
  return (
    <nav className="editor-tabs page-tabs" aria-label={t("invoiceManagement")}>
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={`editor-tab${active === tab.id ? " active" : ""}`}
          aria-current={active === tab.id ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
