"use client";

import Link from "next/link";
import { useLocale } from "@/components/localization/LocaleProvider";

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();
  const nav = [
    [t("dashboard"), "/employee"],
    [t("timesheet"), "/employee/timesheets/current"],
    [t("history"), "/employee/timesheets"],
    [t("reports"), "/employee/reports"],
    [t("approvals"), "/manager/approvals"],
    [t("admin"), "/admin"],
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">D</span>
          <span>
            Debageri
            <br />
            Portal
          </span>
        </div>
        <nav aria-label={t("mainMenu")}>
          {nav.map(([label, href], index) => (
            <Link
              className={`nav-link ${index === 1 ? "active" : ""}`}
              href={href!}
              key={href}
            >
              {label}
            </Link>
          ))}
        </nav>
        <p
          style={{
            position: "absolute",
            bottom: 24,
            color: "#c4a98e",
            fontSize: 12,
          }}
        >
          Debageri AB · {t("internal")}
        </p>
      </aside>
      <main className="main">{children}</main>
      <nav className="mobilebar" aria-label={t("mobileMenu")}>
        {nav.slice(0, 4).map(([label, href]) => (
          <Link href={href!} key={href}>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
