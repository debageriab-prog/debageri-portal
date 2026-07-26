export default function HistoryPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Tidrapportering</div>
          <h1>Historik</h1>
        </div>
      </div>
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Vecka</th>
              <th>Period</th>
              <th>Rapporterat</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["30", "20–26 juli", "40 h", "Godkänd"],
              ["29", "13–19 juli", "40 h", "Godkänd"],
              ["28", "6–12 juli", "40 h", "Godkänd"],
              ["27", "29 juni–5 juli", "40 h", "Godkänd"],
            ].map((row) => (
              <tr key={row[0]}>
                {row.map((cell) => (
                  <td key={cell}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
