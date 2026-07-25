export default function TimeCodesPage() {
  const codes = [
    ["REG", "Ordinarie arbetstid", "Arbete"],
    ["VAC", "Semester", "Semester"],
    ["PARENTAL", "Föräldraledighet", "Frånvaro"],
    ["SICK", "Sjukfrånvaro", "Frånvaro"],
    ["VAB", "Vård av barn", "Frånvaro"],
    ["OVERTIME", "Övertid", "Övertid"],
  ];
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Administration</div>
          <h1>Tidkoder</h1>
        </div>
        <button className="button">Ny tidkod</button>
      </div>
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Kod</th>
              <th>Namn</th>
              <th>Kategori</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((row) => (
              <tr key={row[0]}>
                {row.map((cell) => (
                  <td key={cell}>{cell}</td>
                ))}
                <td>
                  <span className="status">Aktiv</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
