"use client";

import { FormEvent, useState } from "react";
import {
  getMultiFactorResolver,
  multiFactor,
  signInWithEmailAndPassword,
  signOut,
  TotpMultiFactorGenerator,
  type MultiFactorError,
  type MultiFactorResolver,
  type TotpSecret,
  type User,
} from "firebase/auth";
import QRCode from "qrcode";
import { appCheckFetch, getFirebaseClient } from "@/lib/firebase/client";
import { useLocale } from "@/components/localization/LocaleProvider";
import { BrandLogo } from "@/components/brand/BrandLogo";
import type { MessageKey } from "@/lib/localization/messages";

type Step =
  | { kind: "credentials" }
  | { kind: "totp"; resolver: MultiFactorResolver }
  | {
      kind: "enroll";
      user: User;
      secret: TotpSecret | null;
      qrCode: string;
    };

const authenticatorApps: { key: MessageKey; href: string }[] = [
  {
    key: "mfaGoogleAuthenticatorAndroid",
    href: "https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2",
  },
  {
    key: "mfaGoogleAuthenticatorIos",
    href: "https://apps.apple.com/app/google-authenticator/id388497605",
  },
  {
    key: "mfaMicrosoftAuthenticator",
    href: "https://www.microsoft.com/security/mobile-authenticator-app",
  },
];

class SessionError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function errorCode(reason: unknown) {
  if (reason instanceof SessionError) return reason.code;
  return typeof reason === "object" && reason && "code" in reason
    ? String(reason.code)
    : "";
}

function friendlyAuthError(
  reason: unknown,
  t: (key: MessageKey) => string,
  fallback: string,
) {
  const code = errorCode(reason);
  if (
    [
      "auth/invalid-credential",
      "auth/user-not-found",
      "auth/wrong-password",
    ].includes(code)
  )
    return t("loginInvalidCredentials");
  if (code === "auth/too-many-requests") return t("loginTooManyAttempts");
  if (code === "auth/user-disabled") return t("loginAccountDisabled");
  if (code === "auth/network-request-failed") return t("loginNetworkError");
  if (["auth/invalid-verification-code", "auth/missing-code"].includes(code))
    return t("mfaInvalidCode");
  if (code === "auth/requires-recent-login" || code === "auth/code-expired")
    return t("mfaSessionExpired");
  return fallback;
}

export default function LoginPage() {
  const { locale, setLocale, t } = useLocale();
  const [step, setStep] = useState<Step>({ kind: "credentials" });
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function startSession(idToken: string) {
    const response = await appCheckFetch("/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      role?: string;
    };
    if (!response.ok) throw new SessionError(result.error ?? "accessDenied");
    const destination =
      result.role === "admin" || result.role === "manager"
        ? "/manager/approvals"
        : result.role === "accountant"
          ? "/time-reports"
          : "/employee/timesheets/current";
    window.location.assign(destination);
  }

  async function beginEnrollment(user: User) {
    const prepared = await appCheckFetch("/api/auth/mfa/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: await user.getIdToken() }),
    });
    if (!prepared.ok) throw new Error(t("mfaSetupFailed"));
    await user.reload();
    await user.getIdToken(true);
    setStep({ kind: "enroll", user, secret: null, qrCode: "" });
    const session = await multiFactor(user).getSession();
    const secret = await TotpMultiFactorGenerator.generateSecret(session);
    const qrCode = await QRCode.toDataURL(
      secret.generateQrCodeUrl(user.email ?? email, "Debageri Portal"),
      { margin: 1, width: 220 },
    );
    setStep({ kind: "enroll", user, secret, qrCode });
  }

  function restart(message = "") {
    const { auth } = getFirebaseClient();
    void signOut(auth);
    setStep({ kind: "credentials" });
    setInfo(message);
  }

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    const form = new FormData(event.currentTarget);
    const { auth } = getFirebaseClient();
    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        String(form.get("email")),
        String(form.get("password")),
      );
      try {
        await startSession(await credential.user.getIdToken());
      } catch (reason) {
        if (errorCode(reason) !== "mfaEnrollmentRequired") throw reason;
        await beginEnrollment(credential.user);
      }
    } catch (reason) {
      if (errorCode(reason) === "auth/multi-factor-auth-required") {
        setStep({
          kind: "totp",
          resolver: getMultiFactorResolver(auth, reason as MultiFactorError),
        });
      } else {
        if (auth.currentUser) void signOut(auth);
        setStep({ kind: "credentials" });
        setError(friendlyAuthError(reason, t, t("loginFailed")));
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.kind !== "totp") return;
    setBusy(true);
    setError("");
    const code = String(new FormData(event.currentTarget).get("code")).trim();
    try {
      const hint = step.resolver.hints.find(
        (factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID,
      );
      if (!hint) throw new Error(t("mfaSetupFailed"));
      const credential = await step.resolver.resolveSignIn(
        TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code),
      );
      await startSession(await credential.user.getIdToken());
    } catch (reason) {
      if (errorCode(reason) === "auth/requires-recent-login")
        return restart(t("mfaSessionExpired"));
      setError(friendlyAuthError(reason, t, t("loginFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function submitEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.kind !== "enroll" || !step.secret) return;
    setBusy(true);
    setError("");
    const code = String(new FormData(event.currentTarget).get("code")).trim();
    try {
      await multiFactor(step.user).enroll(
        TotpMultiFactorGenerator.assertionForEnrollment(step.secret, code),
        t("mfaFactorName"),
      );
    } catch (reason) {
      if (errorCode(reason) === "auth/requires-recent-login")
        restart(t("mfaSessionExpired"));
      else setError(friendlyAuthError(reason, t, t("mfaSetupFailed")));
      setBusy(false);
      return;
    }
    try {
      await startSession(await step.user.getIdToken(true));
    } catch {
      // Enrollment succeeded but this token lacks the second-factor claim.
      // Signing in again goes through the regular code step.
      restart(t("mfaEnrolledSignInAgain"));
    } finally {
      setBusy(false);
    }
  }

  const codeInput = (
    <input
      className="field mfa-code-field"
      name="code"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6}"
      maxLength={6}
      minLength={6}
      placeholder="123456"
      autoFocus
      required
    />
  );

  return (
    <main className="login">
      <button
        className="login-language-switch"
        type="button"
        onClick={() => setLocale(locale === "en-SE" ? "sv-SE" : "en-SE")}
      >
        {locale === "en-SE" ? "Svenska" : "English"}
      </button>
      <div className="login-showcase">
        <BrandLogo />
        <div>
          <span className="login-kicker">{t("loginKicker")}</span>
          <h1>{t("loginShowcaseTitle")}</h1>
          <p>{t("loginShowcaseDescription")}</p>
        </div>
        <div className="login-benefits">
          <span>✓ {t("loginBenefitReporting")}</span>
          <span>✓ {t("loginBenefitApprovals")}</span>
          <span>✓ {t("loginBenefitAccess")}</span>
        </div>
      </div>
      <section className="card login-card">
        <div className="mobile-login-brand">
          <BrandLogo />
        </div>
        {step.kind === "credentials" && (
          <>
            <div className="login-heading">
              <div className="eyebrow">{t("employeePortal")}</div>
              <h1>{t("welcomeBack")}</h1>
              <p className="muted">{t("loginIntro")}</p>
            </div>
            <form
              onSubmit={submitCredentials}
              style={{ display: "grid", gap: 14 }}
            >
              <label>
                {t("email")}
                <input
                  className="field"
                  name="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
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
              {info && (
                <p className="notice notice-success" role="status">
                  {info}
                </p>
              )}
              {error && (
                <p className="notice" role="alert">
                  {error}
                </p>
              )}
              <button className="button" disabled={busy}>
                {busy ? t("signingIn") : t("signIn")}
              </button>
            </form>
          </>
        )}

        {step.kind === "totp" && (
          <>
            <div className="login-heading">
              <div className="eyebrow">{t("accountSecurity")}</div>
              <h1>{t("mfaChallengeTitle")}</h1>
              <p className="muted">{t("mfaChallengeBody")}</p>
            </div>
            <form onSubmit={submitCode} style={{ display: "grid", gap: 14 }}>
              <label>
                {t("mfaCode")}
                {codeInput}
              </label>
              {error && (
                <p className="notice" role="alert">
                  {error}
                </p>
              )}
              <button className="button" disabled={busy}>
                {busy ? t("mfaVerifying") : t("mfaVerify")}
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => restart()}
              >
                {t("backToSignIn")}
              </button>
            </form>
          </>
        )}

        {step.kind === "enroll" && (
          <>
            <div className="login-heading">
              <div className="eyebrow">{t("accountSecurity")}</div>
              <h1>{t("mfaRequiredTitle")}</h1>
            </div>
            <div className="notice notice-warning" role="status">
              <p>{t("mfaRequiredBody")}</p>
              <p>
                <strong>{t("mfaGetApp")}</strong>
              </p>
              <ul className="mfa-app-links">
                {authenticatorApps.map((app) => (
                  <li key={app.key}>
                    <a href={app.href} target="_blank" rel="noopener">
                      {t(app.key)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            {step.secret ? (
              <form
                onSubmit={submitEnrollment}
                style={{ display: "grid", gap: 14 }}
              >
                <p>{t("mfaScanQr")}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="mfa-qr"
                  src={step.qrCode}
                  alt={t("mfaQrAlt")}
                  width={220}
                  height={220}
                />
                <p className="muted">
                  {t("mfaSetupKey")}{" "}
                  <code className="mfa-secret">{step.secret.secretKey}</code>
                </p>
                <label>
                  {t("mfaEnrollCodeLabel")}
                  {codeInput}
                </label>
                {error && (
                  <p className="notice" role="alert">
                    {error}
                  </p>
                )}
                <button className="button" disabled={busy}>
                  {busy ? t("mfaActivating") : t("mfaActivate")}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => restart()}
                >
                  {t("backToSignIn")}
                </button>
              </form>
            ) : (
              <p className="muted">{t("mfaPreparing")}</p>
            )}
          </>
        )}
        <p className="login-support">{t("loginSupport")}</p>
      </section>
    </main>
  );
}
