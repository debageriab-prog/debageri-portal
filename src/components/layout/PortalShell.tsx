"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { PortalUser } from "@/domain/types";
import { useLocale } from "@/components/localization/LocaleProvider";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AccountMenu } from "@/components/layout/AccountMenu";

type NavItem = { label: string; href: string };
type NavIconName =
  "clock" | "reports" | "finance" | "documents" | "bell" | "settings" | "admin";
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

function financeItems(t: Translate): NavItem[] {
  return [
    { label: t("financialOverview"), href: "/finance" },
    {
      label: t("incomeExpenseManagement"),
      href: "/finance?section=transactions",
    },
    { label: t("invoiceManagement"), href: "/finance?section=invoices" },
    { label: t("vatSettlements"), href: "/finance/vat-settlements" },
    {
      label: t("categoryManagement"),
      href: "/finance?section=categories",
    },
    {
      label: t("customerManagement"),
      href: "/finance?section=customers",
    },
    {
      label: t("compensationManagement"),
      href: "/finance?section=compensation",
    },
  ];
}

function navigation(user: PortalUser, t: Translate): NavGroup[] {
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
        icon: "reports",
        items: [
          { label: t("approvals"), href: "/manager/approvals" },
          { label: t("timeReports"), href: "/time-reports" },
          { label: t("reminder"), href: "/reminders" },
          { label: t("timeCodes"), href: "/admin/time-codes" },
          { label: t("redDays"), href: "/admin/red-days" },
        ],
      },
      {
        id: "finance",
        label: t("finance"),
        icon: "finance",
        items: financeItems(t),
      },
      {
        id: "documents",
        label: t("documents"),
        icon: "documents",
        items: [{ label: t("contracts"), href: "/documents/contracts" }],
      },
      {
        id: "admin",
        label: t("admin"),
        icon: "admin",
        items: [
          { label: t("employees"), href: "/admin/users" },
          { label: t("organization"), href: "/admin/settings" },
          { label: t("emailSettings"), href: "/admin/email-settings" },
          { label: t("emailTemplates"), href: "/admin/email-templates" },
          { label: t("auditHistory"), href: "/admin/audit" },
        ],
      },
    ] satisfies NavGroup[];

  if (user.role === "accountant")
    return [
      {
        id: "time-reports",
        label: t("timeReports"),
        icon: "reports",
        items: [
          { label: t("timeReports"), href: "/time-reports" },
          { label: t("reminder"), href: "/reminders" },
        ],
      },
      {
        id: "finance",
        label: t("finance"),
        icon: "finance",
        items: financeItems(t),
      },
      {
        id: "documents",
        label: t("documents"),
        icon: "documents",
        items: [{ label: t("contracts"), href: "/documents/contracts" }],
      },
    ] satisfies NavGroup[];

  if (user.role === "manager") {
    const groups: NavGroup[] = [];
    if (reporting.length)
      groups.push({
        id: "time-reporting",
        label: t("timeReport"),
        icon: "clock",
        items: reporting,
      });
    groups.push({
      id: "time-reports",
      label: t("timeReports"),
      icon: "reports",
      items: [
        { label: t("approvals"), href: "/manager/approvals" },
        { label: t("timeReports"), href: "/time-reports" },
        { label: t("reminder"), href: "/reminders" },
      ],
    });
    groups.push({
      id: "documents",
      label: t("documents"),
      icon: "documents",
      items: [{ label: t("contracts"), href: "/documents/contracts" }],
    });
    return groups;
  }

  const groups: NavGroup[] = [
    {
      id: "time-reporting",
      label: t("timeReport"),
      icon: "clock",
      items: reporting,
    },
  ];
  if (
    user.compensationModel === "flexible" &&
    user.financeAccess.enabled &&
    (user.financeAccess.myFinance || user.financeAccess.myInvoices)
  )
    groups.push({
      id: "finance",
      label: t("finance"),
      icon: "finance",
      items: [
        ...(user.financeAccess.myFinance
          ? [{ label: t("myFinances"), href: "/finance" }]
          : []),
        ...(user.financeAccess.myInvoices
          ? [
              {
                label: t("myInvoices"),
                href: "/finance?section=invoices",
              },
            ]
          : []),
      ],
    });
  if (user.documentAccess.contracts)
    groups.push({
      id: "documents",
      label: t("documents"),
      icon: "documents",
      items: [{ label: t("contracts"), href: "/documents/contracts" }],
    });
  return groups;
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
