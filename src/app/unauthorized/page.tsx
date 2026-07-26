"use client";
import { useLocale } from "@/components/localization/LocaleProvider";

export default function UnauthorizedPage() {
  const { t } = useLocale();
  return (
    <main className="login">
      <section className="card login-card">
        <h1>{t("unauthorized")}</h1>
        <p className="muted">{t("unauthorizedHelp")}</p>
      </section>
    </main>
  );
}
