"use client";

import Link from "next/link";
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
          label: "Current timesheet",
          href: "/employee/timesheets/current",
        },
        { label: t("history"), href: "/employee/timesheets" },
      ]
    : [];
  if (user.role === "admin")
    return [
      {
        label: "Time report",
        items: [
          { label: "Approvals", href: "/manager/approvals" },
          { label: "Time reports", href: "/time-reports" },
        ],
      },
      {
        label: "Time management",
        items: [
          { label: "Time codes", href: "/admin/time-codes" },
          { label: "Red days", href: "/admin/red-days" },
          { label: "Employment terms", href: "/admin/employment-terms" },
        ],
      },
      {
        label: "Administration",
        items: [
          { label: "Employees", href: "/admin/users" },
          { label: "Organization", href: "/admin/settings" },
          { label: "Audit history", href: "/admin/audit" },
        ],
      },
    ] satisfies NavGroup[];
  if (user.role === "accountant")
    return [
      {
        label: "Time reports",
        items: [{ label: "Time reports", href: "/time-reports" }],
      },
    ] satisfies NavGroup[];
  if (user.role === "manager")
    return [
      ...(reporting.length ? [{ label: "Time report", items: reporting }] : []),
      {
        label: "Timereports",
        items: [
          { label: "Approvals", href: "/manager/approvals" },
          { label: "Time reports", href: "/time-reports" },
        ],
      },
    ] satisfies NavGroup[];
  return [{ label: "Time report", items: reporting }] satisfies NavGroup[];
}

export function PortalShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: PortalUser;
}) {
  const { t } = useLocale();
  const groups = navigation(user, t);
  const items = groups.flatMap((group) => group.items);
  return (
    <div className="shell">
      <aside className="sidebar">
        <BrandLogo inverse />
        <p className="sidebar-intro">Your workday, clearly organized.</p>
        <nav aria-label={t("mainMenu")}>
          {groups.map((group, index) => (
            <div className="nav-group" key={group.label ?? index}>
              {group.label && (
                <span className="nav-group-label">{group.label}</span>
              )}
              {group.items.map((item) => (
                <Link className="nav-link" href={item.href} key={item.href}>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className="main">
        <AccountMenu user={user} />
        {children}
      </main>
      <nav className="mobilebar" aria-label={t("mobileMenu")}>
        {items.map((item) => (
          <Link href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
