"use client";

import Link from "next/link";
import { useLocale } from "@/components/localization/LocaleProvider";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { InfoTip } from "@/components/ui/InfoTip";
import type { UserGroupFormValues } from "./UserGroupForm";

export function UserGroupList({
  groups,
  saved,
}: {
  groups: UserGroupFormValues[];
  saved: "created" | "updated" | null;
}) {
  const { t } = useLocale();
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("admin")}</div>
          <h1>{t("userGroups")}</h1>
          <p className="muted page-description">{t("userGroupsDescription")}</p>
        </div>
        <Link className="button" href="/admin/groups/new">
          {t("addUserGroup")}
        </Link>
      </div>
      {saved && (
        <p className="notice notice-success">
          {t(saved === "created" ? "userGroupCreated" : "userGroupUpdated")}
        </p>
      )}
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("name")}</th>
              <th>{t("userGroupMembers")}</th>
              <th>{t("status")}</th>
              <th>
                <span className="sr-only">{t("actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                {t("companyGroupName")}{" "}
                <InfoTip text={t("companyGroupDescription")} />
              </td>
              <td className="muted">{t("companyGroupNoMembers")}</td>
              <td>
                <span className="status status-active">
                  {t("userGroupStatus_active")}
                </span>
              </td>
              <td>
                <span className="muted">{t("userGroupBuiltIn")}</span>
              </td>
            </tr>
            {groups.map((group) => (
              <tr key={group.id}>
                <td>
                  {group.name}{" "}
                  {group.description && <InfoTip text={group.description} />}
                </td>
                <td>{group.members}</td>
                <td>
                  <span
                    className={`status ${group.status === "active" ? "status-active" : "status-inactive"}`}
                  >
                    {t(`userGroupStatus_${group.status}`)}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    <Link
                      className="table-action icon-action"
                      aria-label={t("edit")}
                      title={t("edit")}
                      href={`/admin/groups/${encodeURIComponent(group.id)}/edit`}
                    >
                      <ActionIcon type="edit" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {groups.length === 0 && <p className="muted">{t("noUserGroups")}</p>}
      </section>
    </>
  );
}
