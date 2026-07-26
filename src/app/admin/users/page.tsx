"use client";
import { useLocale } from "@/components/localization/LocaleProvider";

export default function UsersPage() {
  const { t } = useLocale();
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("admin")}</div>
          <h1>{t("employees")}</h1>
        </div>
        <button className="button">{t("newUser")}</button>
      </div>
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("name")}</th>
              <th>{t("number")}</th>
              <th>{t("role")}</th>
              <th>{t("manager")}</th>
              <th>{t("status")}</th>
            </tr>
          </thead>
          <tbody>
            {[
              [
                "Erik Lind",
                "DB-001",
                t("administrator"),
                t("noValue"),
                t("active"),
              ],
              ["Maria Holm", "DB-002", t("manager"), "Erik Lind", t("active")],
              [
                "Anna Sjöberg",
                "DB-004",
                t("employeeRole"),
                "Maria Holm",
                t("active"),
              ],
              [
                "Oskar Berg",
                "DB-005",
                t("employeeRole"),
                "Maria Holm",
                t("active"),
              ],
            ].map((row) => (
              <tr key={row[1]}>
                {row.map((cell) => (
                  <td key={cell}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
