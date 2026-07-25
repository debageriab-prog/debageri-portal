export default function UsersPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Administration</div>
          <h1>Medarbetare</h1>
        </div>
        <button className="button">Ny användare</button>
      </div>
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Namn</th>
              <th>Nummer</th>
              <th>Roll</th>
              <th>Chef</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Erik Lind", "DB-001", "Admin", "–", "Aktiv"],
              ["Maria Holm", "DB-002", "Chef", "Erik Lind", "Aktiv"],
              ["Anna Sjöberg", "DB-004", "Medarbetare", "Maria Holm", "Aktiv"],
              ["Oskar Berg", "DB-005", "Medarbetare", "Maria Holm", "Aktiv"],
            ].map((row) => (
              <tr key={row[1]}>
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
