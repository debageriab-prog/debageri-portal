"use client";
import { useLocale } from "@/components/localization/LocaleProvider";

export default function NotFound() {
  const { t } = useLocale();
  return (
    <main className="login">
      <section className="card login-card">
        <h1>{t("pageNotFound")}</h1>
        <p className="muted">{t("pageNotFoundHelp")}</p>
      </section>
    </main>
  );
}
