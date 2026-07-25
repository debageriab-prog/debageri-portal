export default function SettingsPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Administration</div>
          <h1>Organisation</h1>
        </div>
      </div>
      <section className="card">
        <h2>Debageri AB</h2>
        <p>
          <strong>Organisations-ID</strong>
          <br />
          debageri
        </p>
        <p>
          <strong>Tidszon</strong>
          <br />
          Europe/Stockholm
        </p>
        <p>
          <strong>Standardspråk</strong>
          <br />
          Svenska (sv-SE)
        </p>
        <p>
          <strong>Veckostart</strong>
          <br />
          Måndag
        </p>
      </section>
    </>
  );
}
