"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="login">
      <section className="card login-card">
        <h1>Något gick fel</h1>
        <p className="muted">
          Försök igen. Om felet kvarstår, kontakta en administratör.
        </p>
        <button className="button" onClick={reset}>
          Försök igen
        </button>
      </section>
    </main>
  );
}
