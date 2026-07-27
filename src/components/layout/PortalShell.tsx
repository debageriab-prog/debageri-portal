"use client";

import Link from "next/link";
import type { PortalUser } from "@/domain/types";
import { useLocale } from "@/components/localization/LocaleProvider";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AccountMenu } from "@/components/layout/AccountMenu";

export function PortalShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: PortalUser;
}) {
  const { t } = useLocale();
  const nav: Array<[string, string]> = [
    [t("timesheet"), "/employee/timesheets/current"],
    [t("history"), "/employee/timesheets"],
  ];
  if (["manager", "admin"].includes(user.role))
    nav.push([t("approvals"), "/manager/approvals"]);
  if (user.role === "admin") nav.push([t("admin"), "/admin"]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <BrandLogo inverse />
        <p className="sidebar-intro">Your workday, clearly organized.</p>
        <nav aria-label={t("mainMenu")}>
          {nav.map(([label, href]) => (
            <Link className="nav-link" href={href} key={href}>
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="main">
        <AccountMenu user={user} />
        {children}
      </main>
      <nav className="mobilebar" aria-label={t("mobileMenu")}>
        {nav.map(([label, href]) => (
          <Link href={href} key={href}>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
