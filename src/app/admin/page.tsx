import Link from "next/link";
export default function AdminPage() {
  const cards = [
    ["Användare", "Hantera roller, status och chefsrelationer", "/admin/users"],
    [
      "Anställningsvillkor",
      "Datumsatta scheman och sysselsättningsgrad",
      "/admin/employment-terms",
    ],
    ["Tidkoder", "Konfigurera valbara rapporteringskoder", "/admin/time-codes"],
    ["Organisation", "Inställningar för Debageri", "/admin/settings"],
    ["Revisionshistorik", "Spårbara känsliga händelser", "/admin/audit"],
  ];
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Administration</div>
          <h1>Portalinställningar</h1>
        </div>
      </div>
      <div className="grid-2">
        {cards.map(([title, body, href]) => (
          <Link
            href={href!}
            className="card"
            style={{ textDecoration: "none", color: "inherit" }}
            key={title}
          >
            <h2>{title}</h2>
            <p className="muted">{body}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
