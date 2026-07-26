export default function EmploymentTermsPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Administration</div>
          <h1>Anställningsvillkor</h1>
          <p className="muted">
            Datumsatta villkor bevarar historiska beräkningar.
          </p>
        </div>
        <button className="button">Nytt villkor</button>
      </div>
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Medarbetare</th>
              <th>Gäller från</th>
              <th>Gäller till</th>
              <th>Omfattning</th>
              <th>Veckotid</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Anna Sjöberg</td>
              <td>2026-01-01</td>
              <td>–</td>
              <td>100 %</td>
              <td>40 h</td>
            </tr>
            <tr>
              <td>Oskar Berg</td>
              <td>2026-05-01</td>
              <td>–</td>
              <td>80 %</td>
              <td>32 h</td>
            </tr>
          </tbody>
        </table>
      </section>
    </>
  );
}
