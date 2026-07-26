export default function ReviewPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Granskning · Vecka 31</div>
          <h1>Anna Sjöberg</h1>
          <p className="muted">DB-004 · 27 juli–2 augusti 2026</p>
        </div>
        <span className="status">Inskickad</span>
      </div>
      <div className="grid-2">
        <section className="card">
          <h2>Rapporterad tid</h2>
          {[
            "Måndag · REG · 8 h",
            "Tisdag · REG · 8 h",
            "Onsdag · REG 6 h + PARENTAL 2 h",
            "Torsdag · REG · 8 h",
            "Fredag · REG · 8 h",
          ].map((line) => (
            <p
              key={line}
              style={{
                borderBottom: "1px solid var(--border)",
                paddingBottom: 12,
              }}
            >
              {line}
            </p>
          ))}
        </section>
        <aside className="card">
          <h2>Sammanfattning</h2>
          <p>
            Förväntat <strong style={{ float: "right" }}>40 h</strong>
          </p>
          <p>
            Rapporterat <strong style={{ float: "right" }}>40 h</strong>
          </p>
          <p>
            Arbetat <strong style={{ float: "right" }}>38 h</strong>
          </p>
          <hr style={{ borderColor: "var(--border)" }} />
          <label>
            Avslagsorsak
            <textarea
              className="field"
              rows={4}
              placeholder="Krävs vid avslag"
            />
          </label>
          <div className="actions" style={{ marginTop: 14 }}>
            <button className="button">Godkänn</button>
            <button className="button danger">Avslå</button>
          </div>
        </aside>
      </div>
    </>
  );
}
