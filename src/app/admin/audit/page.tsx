export default function AuditPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Administration</div>
          <h1>Revisionshistorik</h1>
        </div>
      </div>
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tid</th>
              <th>Aktör</th>
              <th>Händelse</th>
              <th>Objekt</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>2026-07-26 16:42</td>
              <td>anna</td>
              <td>timesheet.submitted</td>
              <td>2026-W31</td>
            </tr>
            <tr>
              <td>2026-07-25 10:03</td>
              <td>admin</td>
              <td>timeCode.updated</td>
              <td>VAC</td>
            </tr>
          </tbody>
        </table>
      </section>
    </>
  );
}
