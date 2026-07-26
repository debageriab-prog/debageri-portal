"use client";

import Link from "next/link";
import type { PortalUser } from "@/domain/types";
import { useLocale } from "@/components/localization/LocaleProvider";
import { BrandLogo } from "@/components/brand/BrandLogo";

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

  async function logout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    window.location.assign("/auth/login");
  }

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
        <div style={{ position: "absolute", bottom: 24, fontSize: 12 }}>
          <div className="user-chip">
            <span className="avatar">{user.displayName.charAt(0)}</span>
            <span>
              <strong>{user.displayName}</strong>
              <small>{user.role}</small>
            </span>
          </div>
          <button className="nav-link" onClick={logout}>
            <span aria-hidden="true">↗</span> Log out
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
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
