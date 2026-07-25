export default function UnauthorizedPage() {
  return (
    <main className="login">
      <section className="card login-card">
        <h1>Ingen åtkomst</h1>
        <p className="muted">
          Ditt konto saknar behörighet till den här sidan.
        </p>
      </section>
    </main>
  );
}
