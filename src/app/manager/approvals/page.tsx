import Link from "next/link";
export default function ApprovalsPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Chef</div>
          <h1>Att godkänna</h1>
          <p className="muted">
            2 inskickade tidrapporter väntar på granskning.
          </p>
        </div>
      </div>
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Medarbetare</th>
              <th>Vecka</th>
              <th>Period</th>
              <th>Förväntat</th>
              <th>Rapporterat</th>
              <th>Inskickad</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Anna Sjöberg
                <br />
                <span className="muted">DB-004</span>
              </td>
              <td>31</td>
              <td>27 jul–2 aug</td>
              <td>40 h</td>
              <td>40 h</td>
              <td>26 jul 16:42</td>
              <td>
                <Link
                  href="/manager/approvals/demo"
                  className="button secondary"
                >
                  Granska
                </Link>
              </td>
            </tr>
            <tr>
              <td>
                Oskar Berg
                <br />
                <span className="muted">DB-005</span>
              </td>
              <td>31</td>
              <td>27 jul–2 aug</td>
              <td>32 h</td>
              <td>32 h</td>
              <td>26 jul 15:18</td>
              <td>
                <Link
                  href="/manager/approvals/demo"
                  className="button secondary"
                >
                  Granska
                </Link>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </>
  );
}
