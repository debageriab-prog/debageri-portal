"use client";
import { useLocale } from "@/components/localization/LocaleProvider";

export default function TimeCodesPage() {
  const { t } = useLocale();
  const codes = [
    ["REG", t("regularWork"), t("work")],
    ["VAC", t("vacation"), t("vacation")],
    ["PARENTAL", t("parentalLeave"), t("absenceCategory")],
    ["SICK", t("sickLeave"), t("absenceCategory")],
    ["VAB", t("careOfSickChild"), t("absenceCategory")],
    ["OVERTIME", t("overtime"), t("overtime")],
  ];
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("admin")}</div>
          <h1>{t("timeCodes")}</h1>
        </div>
        <button className="button">{t("newTimeCode")}</button>
      </div>
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("code")}</th>
              <th>{t("name")}</th>
              <th>{t("category")}</th>
              <th>{t("status")}</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((row) => (
              <tr key={row[0]}>
                {row.map((cell) => (
                  <td key={cell}>{cell}</td>
                ))}
                <td>
                  <span className="status">{t("active")}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
