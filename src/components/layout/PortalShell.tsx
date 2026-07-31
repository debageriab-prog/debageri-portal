"use client";

import Link from "next/link";
import { useState } from "react";
import type { PortalUser } from "@/domain/types";
import { useLocale } from "@/components/localization/LocaleProvider";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AccountMenu } from "@/components/layout/AccountMenu";

type NavItem = { label: string; href: string };
type NavGroup = { label?: string; items: NavItem[] };

function navigation(user: PortalUser, t: ReturnType<typeof useLocale>["t"]) {
  const reporting: NavItem[] = user.reportsTime
    ? [
        {
          label: t("currentTimesheet"),
          href: "/employee/timesheets/current",
        },
        { label: t("history"), href: "/employee/timesheets" },
      ]
    : [];
  if (user.role === "admin")
    return [
      {
        label: t("finance"),
        items: [
          { label: t("financialOverview"), href: "/finance" },
          {
            label: t("compensationManagement"),
            href: "/finance?section=compensation",
          },
          { label: t("invoiceManagement"), href: "/finance?section=invoices" },
          {
            label: t("categoryManagement"),
            href: "/finance?section=categories",
          },
          {
            label: t("incomeExpenseManagement"),
            href: "/finance?section=transactions",
          },
        ],
      },
      {
        label: t("timeReport"),
        items: [
          { label: t("approvals"), href: "/manager/approvals" },
          { label: t("timeReports"), href: "/time-reports" },
        ],
      },
      {
        label: t("reminders"),
        items: [
          { label: t("reminder"), href: "/reminders" },
          { label: t("reminderSettings"), href: "/reminders/settings" },
        ],
      },
      {
        label: t("timeManagement"),
        items: [
          { label: t("timeCodes"), href: "/admin/time-codes" },
          { label: t("redDays"), href: "/admin/red-days" },
        ],
      },
      {
        label: t("admin"),
        items: [
          { label: t("employees"), href: "/admin/users" },
          { label: t("organization"), href: "/admin/settings" },
          { label: t("auditHistory"), href: "/admin/audit" },
        ],
      },
    ] satisfies NavGroup[];
  if (user.role === "accountant")
    return [
      {
        label: t("finance"),
        items: [
          { label: t("financialOverview"), href: "/finance" },
          {
            label: t("compensationManagement"),
            href: "/finance?section=compensation",
          },
          { label: t("invoiceManagement"), href: "/finance?section=invoices" },
          {
            label: t("categoryManagement"),
            href: "/finance?section=categories",
          },
          {
            label: t("incomeExpenseManagement"),
            href: "/finance?section=transactions",
          },
        ],
      },
      {
        label: t("timeReports"),
        items: [
          { label: t("timeReports"), href: "/time-reports" },
          { label: t("reminder"), href: "/reminders" },
        ],
      },
    ] satisfies NavGroup[];
  if (user.role === "manager")
    return [
      ...(reporting.length
        ? [{ label: t("timeReport"), items: reporting }]
        : []),
      {
        label: t("timeReports"),
        items: [
          { label: t("approvals"), href: "/manager/approvals" },
          { label: t("timeReports"), href: "/time-reports" },
          { label: t("reminder"), href: "/reminders" },
        ],
      },
    ] satisfies NavGroup[];
  return [
    ...(user.compensationModel === "flexible"
      ? [
          {
            label: t("finance"),
            items: [{ label: t("myFinances"), href: "/finance" }],
          },
        ]
      : []),
    { label: t("timeReport"), items: reporting },
  ] satisfies NavGroup[];
}

export function PortalShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: PortalUser;
}) {
  const { t } = useLocale();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const groups = navigation(user, t);
  return (
    <div className="shell">
      <header className="mobile-header">
        <button
          className="mobile-menu-trigger"
          type="button"
          aria-label="Open main menu"
          aria-expanded={mobileMenuOpen}
          aria-controls="portal-navigation"
          onClick={() => setMobileMenuOpen(true)}
        >
          <span />
          <span />
          <span />
        </button>
        <BrandLogo inverse />
      </header>
      <AccountMenu user={user} />
      {mobileMenuOpen && (
        <button
          className="mobile-menu-backdrop"
          aria-label="Close main menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <aside
        className={`sidebar${mobileMenuOpen ? " mobile-open" : ""}`}
        id="portal-navigation"
      >
        <button
          className="mobile-menu-close"
          type="button"
          aria-label="Close main menu"
          onClick={() => setMobileMenuOpen(false)}
        >
          ×
        </button>
        <BrandLogo inverse />
        <p className="sidebar-intro">Your workday, clearly organized.</p>
        <nav aria-label={t("mainMenu")}>
          {groups.map((group, index) => (
            <div className="nav-group" key={group.label ?? index}>
              {group.label && (
                <span className="nav-group-label">{group.label}</span>
              )}
              {group.items.map((item) => (
                <Link
                  className="nav-link"
                  href={item.href}
                  key={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
