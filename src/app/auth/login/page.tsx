"use client";

import { FormEvent, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { appCheckFetch, getFirebaseClient } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";
import { BrandLogo } from "@/components/brand/BrandLogo";

function friendlyAuthError(reason: unknown, fallback: string) {
  const code =
    typeof reason === "object" && reason && "code" in reason
      ? String(reason.code)
      : "";
  if (
    [
      "auth/invalid-credential",
      "auth/user-not-found",
      "auth/wrong-password",
    ].includes(code)
  )
    return "The email or password is incorrect. Please try again.";
  if (code === "auth/too-many-requests")
    return "Too many attempts. Please wait a moment and try again.";
  if (code === "auth/user-disabled")
    return "This account has been disabled. Contact your administrator.";
  if (code === "auth/network-request-failed")
    return "We could not connect. Check your internet connection and try again.";
  return fallback;
}

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
      const response = await appCheckFetch("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: await credential.user.getIdToken() }),
      });
      if (!response.ok) throw new Error(t("accessDenied"));
      const result = (await response.json()) as { role: string };
      window.location.assign(
        result.role === "admin" ? "/admin" : "/employee/timesheets/current",
      );
    } catch (reason) {
      setError(friendlyAuthError(reason, t("loginFailed")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <div className="login-showcase">
        <BrandLogo />
        <div>
          <span className="login-kicker">Debageri workspace</span>
          <h1>Everything about your workday, in one calm place.</h1>
          <p>
            Report time, follow approvals and keep employment information
            organized, securely and without unnecessary administration.
          </p>
        </div>
        <div className="login-benefits">
          <span>✓ Simple weekly reporting</span>
          <span>✓ Clear approval history</span>
          <span>✓ Secure employee access</span>
        </div>
      </div>
      <section className="card login-card">
        <div className="mobile-login-brand">
          <BrandLogo />
        </div>
        <div className="login-heading">
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
        <p className="login-support">
          Trouble signing in? Contact your portal administrator.
        </p>
      </section>
    </main>
  );
}
