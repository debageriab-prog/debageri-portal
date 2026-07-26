"use client";

import { FormEvent, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";

export default function LoginPage() {
  const { t } = useLocale();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const { auth } = getFirebaseClient();
      const credential = await signInWithEmailAndPassword(
        auth,
        String(form.get("email")),
        String(form.get("password")),
      );
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: await credential.user.getIdToken() }),
      });
      if (!response.ok) throw new Error(t("accessDenied"));
      window.location.assign("/employee");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("loginFailed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="card login-card">
        <div className="brand">
          <span className="brand-mark">D</span>
          <span>Debageri Portal</span>
        </div>
        <div style={{ margin: "35px 0 22px" }}>
          <div className="eyebrow">{t("employeePortal")}</div>
          <h1>{t("welcomeBack")}</h1>
          <p className="muted">{t("loginIntro")}</p>
        </div>
        <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
          <label>
            {t("email")}
            <input
              className="field"
              name="email"
              type="email"
              autoComplete="username"
              required
            />
          </label>
          <label>
            {t("password")}
            <input
              className="field"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
          <button className="button" disabled={busy}>
            {busy ? t("signingIn") : t("signIn")}
          </button>
        </form>
      </section>
    </main>
  );
}
