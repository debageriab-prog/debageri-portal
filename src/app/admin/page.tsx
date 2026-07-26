"use client";
import Link from "next/link";
import { useLocale } from "@/components/localization/LocaleProvider";

export default function AdminPage() {
  const { t } = useLocale();
  const cards = [
    [t("users"), t("usersDescription"), "/admin/users"],
    [
      t("employmentTerms"),
      t("employmentTermsDescription"),
      "/admin/employment-terms",
    ],
    [t("timeCodes"), t("timeCodesDescription"), "/admin/time-codes"],
    [t("organization"), t("organizationDescription"), "/admin/settings"],
    [t("auditHistory"), t("auditHistoryDescription"), "/admin/audit"],
  ];
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("admin")}</div>
          <h1>{t("portalSettings")}</h1>
          <p className="muted page-description">
            Manage your people, working agreements, reporting categories and
            organization-wide portal settings.
          </p>
        </div>
      </div>
      <div className="grid-2">
        {cards.map(([title, body, href]) => (
          <Link
            href={href!}
            className="card"
            style={{ textDecoration: "none", color: "inherit" }}
            key={title}
          >
            <h2>{title}</h2>
            <p className="muted">{body}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
