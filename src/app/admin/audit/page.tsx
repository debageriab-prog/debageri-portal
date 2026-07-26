"use client";
import { useLocale } from "@/components/localization/LocaleProvider";

export default function AuditPage() {
  const { t } = useLocale();
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("admin")}</div>
          <h1>{t("auditHistory")}</h1>
        </div>
      </div>
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("time")}</th>
              <th>{t("actor")}</th>
              <th>{t("event")}</th>
              <th>{t("entity")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>2026-07-26 16:42</td>
              <td>anna</td>
              <td>timesheet.submitted</td>
              <td>2026-W31</td>
            </tr>
            <tr>
              <td>2026-07-25 10:03</td>
              <td>admin</td>
              <td>timeCode.updated</td>
              <td>VAC</td>
            </tr>
          </tbody>
        </table>
      </section>
    </>
  );
}
