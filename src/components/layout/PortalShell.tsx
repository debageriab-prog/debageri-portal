"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { PortalUser } from "@/domain/types";
import { useLocale } from "@/components/localization/LocaleProvider";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AccountMenu } from "@/components/layout/AccountMenu";

type NavItem = { label: string; href: string };
type NavGroup = { id: string; label: string; items: NavItem[] };
type Translate = ReturnType<typeof useLocale>["t"];

function financeItems(t: Translate): NavItem[] {
  return [
    { label: t("financialOverview"), href: "/finance" },
    {
      label: t("compensationManagement"),
      href: "/finance?section=compensation",
    },
    { label: t("invoiceManagement"), href: "/finance?section=invoices" },
    {
      label: t("customerManagement"),
      href: "/finance?section=customers",
    },
    {
      label: t("categoryManagement"),
      href: "/finance?section=categories",
    },
    {
      label: t("incomeExpenseManagement"),
      href: "/finance?section=transactions",
    },
  ];
}

function navigation(user: PortalUser, t: Translate) {
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
        id: "time-reports",
        label: t("timeReport"),
        items: [
          { label: t("approvals"), href: "/manager/approvals" },
          { label: t("timeReports"), href: "/time-reports" },
        ],
      },
      { id: "finance", label: t("finance"), items: financeItems(t) },
      {
        id: "reminders",
        label: t("reminders"),
        items: [
          { label: t("reminder"), href: "/reminders" },
          { label: t("reminderSettings"), href: "/reminders/settings" },
        ],
      },
      {
        id: "time-management",
        label: t("timeManagement"),
        items: [
          { label: t("timeCodes"), href: "/admin/time-codes" },
          { label: t("redDays"), href: "/admin/red-days" },
        ],
      },
      {
        id: "admin",
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
        id: "time-reports",
        label: t("timeReports"),
        items: [
          { label: t("timeReports"), href: "/time-reports" },
          { label: t("reminder"), href: "/reminders" },
        ],
      },
      { id: "finance", label: t("finance"), items: financeItems(t) },
    ] satisfies NavGroup[];

  if (user.role === "manager")
    return [
      ...(reporting.length
        ? [
            {
              id: "time-reporting",
              label: t("timeReport"),
              items: reporting,
            },
          ]
        : []),
      {
        id: "time-reports",
        label: t("timeReports"),
        items: [
          { label: t("approvals"), href: "/manager/approvals" },
          { label: t("timeReports"), href: "/time-reports" },
          { label: t("reminder"), href: "/reminders" },
        ],
      },
    ] satisfies NavGroup[];

  return [
    { id: "time-reporting", label: t("timeReport"), items: reporting },
    ...(user.compensationModel === "flexible"
      ? [
          {
            id: "finance",
            label: t("finance"),
            items: [
              { label: t("myFinances"), href: "/finance" },
              { label: t("myInvoices"), href: "/finance?section=invoices" },
            ],
          },
        ]
      : []),
  ] satisfies NavGroup[];
}

function itemMatchesRoute(
  item: NavItem,
  pathname: string,
  financeSection: string | null,
) {
  const [targetPath, targetQuery] = item.href.split("?");
  if (targetPath === "/finance") {
    const targetSection = new URLSearchParams(targetQuery).get("section");
    return pathname.startsWith("/finance") && financeSection === targetSection;
  }
  return pathname === targetPath || pathname.startsWith(`${targetPath}/`);
}

export function PortalShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: PortalUser;
}) {
  const { t } = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const groups = navigation(user, t);
  const pathFinanceSection = pathname.startsWith("/finance/")
    ? (pathname.split("/")[2] ?? null)
    : null;
  const financeSection = searchParams.get("section") ?? pathFinanceSection;
  const activeItemHref = groups
    .flatMap((group) => group.items)
    .filter((item) => itemMatchesRoute(item, pathname, financeSection))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;
  const activeGroupId = groups.find((group) =>
    group.items.some((item) => item.href === activeItemHref),
  )?.id;
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const defaultOpenGroupId = activeGroupId ?? groups[0]?.id ?? null;
  const [menuState, setMenuState] = useState({
    routeKey,
    openGroupId: defaultOpenGroupId,
  });
  const openGroupId =
    menuState.routeKey === routeKey
      ? menuState.openGroupId
      : defaultOpenGroupId;

  return (
    <div className="shell">
      <header className="mobile-header">
        <button
          className="mobile-menu-trigger"
          type="button"
          aria-label={t("openMainMenu")}
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
          aria-label={t("closeMainMenu")}
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
          aria-label={t("closeMainMenu")}
          onClick={() => setMobileMenuOpen(false)}
        >
          &times;
        </button>
        <BrandLogo inverse />
        <p className="sidebar-intro">{t("sidebarIntro")}</p>
        <nav aria-label={t("mainMenu")}>
          {groups.map((group) => {
            const open = openGroupId === group.id;
            return (
              <div className={`nav-group${open ? " open" : ""}`} key={group.id}>
                <button
                  className="nav-group-trigger"
                  type="button"
                  aria-expanded={open}
                  aria-controls={`nav-group-${group.id}`}
                  onClick={() =>
                    setMenuState({
                      routeKey,
                      openGroupId: open ? null : group.id,
                    })
                  }
                >
                  <span>{group.label}</span>
                  <span className="nav-group-chevron" aria-hidden="true" />
                </button>
                <div
                  className="nav-submenu"
                  id={`nav-group-${group.id}`}
                  inert={!open}
                >
                  <div className="nav-submenu-inner">
                    {group.items.map((item) => (
                      <Link
                        className={`nav-link${item.href === activeItemHref ? " active" : ""}`}
                        href={item.href}
                        key={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
