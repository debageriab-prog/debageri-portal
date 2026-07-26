"use client";
import { useLocale } from "@/components/localization/LocaleProvider";

export default function ErrorPage({ reset }: { reset: () => void }) {
  const { t } = useLocale();
  return (
    <main className="login">
      <section className="card login-card">
        <h1>{t("somethingWentWrong")}</h1>
        <p className="muted">{t("errorHelp")}</p>
        <button className="button" onClick={reset}>
          {t("tryAgain")}
        </button>
      </section>
    </main>
  );
}
