"use client";

import Link from "next/link";
import type { PortalUser } from "@/domain/types";
import { useLocale } from "@/components/localization/LocaleProvider";

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
        <div className="brand">
          <span className="brand-mark">D</span>
          <span>Debageri Portal</span>
        </div>
        <nav aria-label={t("mainMenu")}>
          {nav.map(([label, href]) => (
            <Link className="nav-link" href={href} key={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div style={{ position: "absolute", bottom: 24, fontSize: 12 }}>
          <div>{user.displayName}</div>
          <button className="nav-link" onClick={logout}>
            Log out
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
