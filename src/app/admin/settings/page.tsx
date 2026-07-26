"use client";
import { useLocale } from "@/components/localization/LocaleProvider";

export default function SettingsPage() {
  const { locale, t } = useLocale();
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("admin")}</div>
          <h1>{t("organization")}</h1>
        </div>
      </div>
      <section className="card">
        <h2>Debageri AB</h2>
        <p>
          <strong>{t("organizationId")}</strong>
          <br />
          debageri
        </p>
        <p>
          <strong>{t("timezone")}</strong>
          <br />
          Europe/Stockholm
        </p>
        <p>
          <strong>{t("defaultLanguage")}</strong>
          <br />
          {locale === "en-SE" ? "English (en-SE)" : "Svenska (sv-SE)"}
        </p>
        <p>
          <strong>{t("weekStarts")}</strong>
          <br />
          {t("mondayValue")}
        </p>
      </section>
    </>
  );
}
