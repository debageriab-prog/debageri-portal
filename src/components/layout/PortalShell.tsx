import Link from "next/link";

const nav = [
  ["Översikt", "/employee"],
  ["Tidrapport", "/employee/timesheets/current"],
  ["Historik", "/employee/timesheets"],
  ["Rapporter", "/employee/reports"],
  ["Godkännanden", "/manager/approvals"],
  ["Administration", "/admin"],
];

export function PortalShell({ children }: { children: React.ReactNode }) {
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
        <nav aria-label="Huvudmeny">
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
          Debageri AB · Internt
        </p>
      </aside>
      <main className="main">{children}</main>
      <nav className="mobilebar" aria-label="Mobilmeny">
        {nav.slice(0, 4).map(([label, href]) => (
          <Link href={href!} key={href}>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
