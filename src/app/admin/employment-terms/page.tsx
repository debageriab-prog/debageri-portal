"use client";
import { useLocale } from "@/components/localization/LocaleProvider";

export default function EmploymentTermsPage() {
  const { t } = useLocale();
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("admin")}</div>
          <h1>{t("employmentTerms")}</h1>
          <p className="muted">{t("datedTermsHelp")}</p>
        </div>
        <button className="button">{t("newTerm")}</button>
      </div>
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("employee")}</th>
              <th>{t("validFrom")}</th>
              <th>{t("validTo")}</th>
              <th>{t("employmentRate")}</th>
              <th>{t("weeklyHours")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Anna Sjöberg</td>
              <td>2026-01-01</td>
              <td>{t("noValue")}</td>
              <td>100 %</td>
              <td>40 h</td>
            </tr>
            <tr>
              <td>Oskar Berg</td>
              <td>2026-05-01</td>
              <td>{t("noValue")}</td>
              <td>80 %</td>
              <td>32 h</td>
            </tr>
          </tbody>
        </table>
      </section>
    </>
  );
}
