import { formatDuration } from "@/lib/durations/duration";
export default function ReportsPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Rapporter</div>
          <h1>Min tid</h1>
          <p className="muted">Vecka, månad, år eller eget datumintervall.</p>
        </div>
      </div>
      <section className="card">
        <div className="actions">
          <button className="button">Denna vecka</button>
          <button className="button secondary">Denna månad</button>
          <button className="button secondary">Detta år</button>
          <button className="button secondary">Eget intervall</button>
        </div>
        <div className="metrics">
          {[
            ["Förväntat", 2400],
            ["Rapporterat", 2400],
            ["Arbetat", 2280],
            ["Frånvaro", 120],
            ["Differens", 0],
          ].map(([label, value]) => (
            <div className="metric" key={label}>
              <span className="muted">{label}</span>
              <strong>{formatDuration(value as number)}</strong>
            </div>
          ))}
        </div>
        <h2>Fördelning per kod</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kod</th>
                <th>Kategori</th>
                <th>Tid</th>
                <th>Andel</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>REG</td>
                <td>Arbete</td>
                <td>38 h</td>
                <td>95 %</td>
              </tr>
              <tr>
                <td>PARENTAL</td>
                <td>Föräldraledighet</td>
                <td>2 h</td>
                <td>5 %</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
