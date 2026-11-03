"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  can,
  canReportTime,
  canViewOwnHistory,
  hasOrganizationFinance,
  type PermissionKey,
} from "@/domain/access/permissions";
import {
  canViewMyFinance,
  canViewMyTransactions,
} from "@/domain/finance/calculations";
import type { PortalUser } from "@/domain/types";
import { useLocale } from "@/components/localization/LocaleProvider";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AccountMenu } from "@/components/layout/AccountMenu";

type NavItem = { label: string; href: string };
type NavIconName =
  | "clock"
  | "reports"
  | "finance"
  | "documents"
  | "receipts"
  | "bell"
  | "settings"
  | "admin";
type NavGroup = {
  id: string;
  label: string;
  icon: NavIconName;
  items: NavItem[];
};
type Translate = ReturnType<typeof useLocale>["t"];

function NavIcon({ name }: { name: NavIconName }) {
  const paths: Record<NavIconName, React.ReactNode> = {
    clock: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5v5l3.25 2" />
      </>
    ),
    reports: (
      <>
        <path d="M5 4.5h14v15H5z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
    finance: (
      <>
        <path d="M4 7.5h16v11H4z" />
        <path d="M4 10.5h16M15.5 14.5h1" />
        <path d="M7 7.5V5.25h10V7.5" />
      </>
    ),
    documents: (
      <>
        <path d="M6 3.5h9l3 3V20H6z" />
        <path d="M15 3.5V7h3M9 11h6M9 15h6" />
      </>
    ),
    receipts: (
      <>
        <path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" />
        <path d="M9 8h6M9 11.5h6M9 15h3.5" />
      </>
    ),
    bell: (
      <>
        <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 5 2 5.5 2 5.5h-15s2-.5 2-5.5Z" />
        <path d="M10 18.5a2.2 2.2 0 0 0 4 0" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" />
      </>
    ),
    admin: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5.5 19c.7-3.4 2.8-5.2 6.5-5.2s5.8 1.8 6.5 5.2" />
      </>
    ),
  };

  return (
    <svg
      className="nav-group-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function financeItems(user: PortalUser, t: Translate): NavItem[] {
  const organizationItems: Array<[PermissionKey, NavItem]> = [
    [
      "finance.ledger.view",
      { label: t("financialOverview"), href: "/finance" },
    ],
    [
      "finance.ledger.view",
      {
        label: t("incomeExpenseManagement"),
        href: "/finance?section=transactions",
      },
    ],
    [
      "finance.invoices.view",
      { label: t("invoiceManagement"), href: "/finance?section=invoices" },
    ],
    [
      "finance.vat.view",
      { label: t("vatSettlements"), href: "/finance/vat-settlements" },
    ],
    [
      "finance.incomingEmails.view",
      {
        label: t("incomingFinancialEmails"),
        href: "/finance/incoming-emails",
      },
    ],
    [
      "finance.categories.view",
      {
        label: t("categoryManagement"),
        href: "/finance?section=categories",
      },
    ],
    [
      "finance.customers.view",
      {
        label: t("customerManagement"),
        href: "/finance?section=customers",
      },
    ],
  ];
  if (hasOrganizationFinance(user))
    return organizationItems
      .filter(([key]) => can(user, key))
      .map(([, item]) => item);
  return [
    ...(canViewMyFinance(user)
      ? [{ label: t("myFinances"), href: "/finance" }]
      : []),
    ...(canViewMyTransactions(user)
      ? [
          {
            label: t("incomeExpenseManagement"),
            href: "/finance?section=transactions",
          },
        ]
      : []),
    ...(can(user, "my.invoices")
      ? [{ label: t("myInvoices"), href: "/finance?section=invoices" }]
      : []),
  ];
}

function documentItems(user: PortalUser, t: Translate): NavItem[] {
  return [
    ...(can(user, "documents.contracts.view") || can(user, "my.contracts")
      ? [{ label: t("contracts"), href: "/documents/contracts" }]
      : []),
    ...(can(user, "documents.payslips.view")
      ? [{ label: t("payslips"), href: "/documents/payslips" }]
      : []),
    ...(can(user, "my.payslips")
      ? [
          can(user, "documents.payslips.view")
            ? {
                label: t("permission_my_payslips"),
                href: "/documents/payslips?mine=1",
              }
            : { label: t("payslips"), href: "/documents/payslips" },
        ]
      : []),
  ];
}

function receiptItems(user: PortalUser, t: Translate): NavItem[] {
  const reviews = can(user, "documents.receipts.review");
  return [
    ...(reviews ? [{ label: t("reviewReceipts"), href: "/receipts" }] : []),
    ...(can(user, "my.receipts")
      ? [
          {
            label: t("myReceipts"),
            href: reviews ? "/receipts?mine=1" : "/receipts",
          },
        ]
      : []),
    ...(can(user, "my.receipts.upload")
      ? [{ label: t("uploadReceipt"), href: "/receipts/new" }]
      : []),
  ];
}

function timeReportItems(user: PortalUser, t: Translate): NavItem[] {
  return [
    ...(can(user, "time.approvals.review")
      ? [{ label: t("approvals"), href: "/manager/approvals" }]
      : []),
    ...(can(user, "time.reports.view")
      ? [{ label: t("timeReports"), href: "/time-reports" }]
      : []),
    ...(can(user, "time.reminders.view")
      ? [{ label: t("reminder"), href: "/reminders" }]
      : []),
    ...(user.role === "admin"
      ? [
          { label: t("timeCodes"), href: "/admin/time-codes" },
          { label: t("redDays"), href: "/admin/red-days" },
        ]
      : []),
  ];
}

function navigation(user: PortalUser, t: Translate): NavGroup[] {
  const admin = user.role === "admin";
  const groups: NavGroup[] = [
    {
      id: "time-reporting",
      label: t("timeReport"),
      icon: "clock",
      items: [
        ...(canReportTime(user)
          ? [
              {
                label: t("reportTimeTitle"),
                href: "/employee/timesheets/current",
              },
            ]
          : []),
        ...(canViewOwnHistory(user)
          ? [{ label: t("history"), href: "/employee/timesheets" }]
          : []),
      ],
    },
    {
      id: "time-reports",
      label: admin ? t("timeReport") : t("timeReports"),
      icon: "reports",
      items: timeReportItems(user, t),
    },
    {
      id: "finance",
      label: t("finance"),
      icon: "finance",
      items: financeItems(user, t),
    },
    {
      id: "documents",
      label: t("documents"),
      icon: "documents",
      items: documentItems(user, t),
    },
    {
      id: "receipts",
      label: t("receipts"),
      icon: "receipts",
      items: receiptItems(user, t),
    },
    {
      id: "admin",
      label: t("admin"),
      icon: "admin",
      items: admin
        ? [
            { label: t("employees"), href: "/admin/users" },
            { label: t("accessProfiles"), href: "/admin/access-profiles" },
            { label: t("organization"), href: "/admin/settings" },
            { label: t("emailSettings"), href: "/admin/email-settings" },
            { label: t("aiIntegration"), href: "/admin/ai-integration" },
            { label: t("auditHistory"), href: "/admin/audit" },
          ]
        : [],
    },
  ];
  return groups.filter((group) => group.items.length > 0);
}

function itemMatchesRoute(
  item: NavItem,
  pathname: string,
  financeSection: string | null,
  mine: string | null,
) {
  const [targetPath, targetQuery] = item.href.split("?");
  if ((new URLSearchParams(targetQuery).get("mine") ?? null) !== mine)
    return false;
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
    .filter((item) =>
      itemMatchesRoute(
        item,
        pathname,
        financeSection,
        searchParams.get("mine"),
      ),
    )
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
                  <span className="nav-group-title">
                    <NavIcon name={group.icon} />
                    <span>{group.label}</span>
                  </span>
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
