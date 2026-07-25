import Link from "next/link";
export default function DashboardPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Söndag 26 juli</div>
          <h1>Hej, Anna</h1>
          <p className="muted">Här är läget i din medarbetarportal.</p>
        </div>
      </div>
      <div className="grid-2">
        <section className="card">
          <span className="status">Utkast</span>
          <h2>Vecka 31 behöver fyllas i</h2>
          <p className="muted">24 av 40 timmar är rapporterade.</p>
          <Link className="button" href="/employee/timesheets/current">
            Fortsätt rapportera
          </Link>
        </section>
        <section className="card">
          <div className="eyebrow">Senaste</div>
          <h2>Vecka 30 godkänd</h2>
          <p className="muted">40 h rapporterat · Godkänd av Erik Lind</p>
        </section>
      </div>
    </>
  );
}
