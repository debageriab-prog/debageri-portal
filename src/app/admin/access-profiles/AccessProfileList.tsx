"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { InfoTip } from "@/components/ui/InfoTip";
import { appCheckFetch } from "@/lib/firebase/client";
import { COMPANY_GROUP_ID } from "@/domain/access/groups";
import {
  accessProfileError,
  type AccessProfileFormValues,
  type GroupChoice,
} from "./AccessProfileForm";

export function AccessProfileList({
  profiles,
  groups,
  saved,
}: {
  profiles: AccessProfileFormValues[];
  groups: GroupChoice[];
  saved: "created" | "updated" | null;
}) {
  const { t } = useLocale();
  const groupNames = new Map<string, string>([
    [COMPANY_GROUP_ID, t("companyGroupName")],
    ...groups.map((group): [string, string] => [group.id, group.name]),
  ]);
  const scopeText = (profile: AccessProfileFormValues) =>
    profile.audience !== "staff"
      ? "-"
      : profile.scope === "all"
        ? t("accessProfileScope_all")
        : profile.groupIds
            .map((id) => groupNames.get(id))
            .filter(Boolean)
            .join(", ") || t("accessProfileScope_none");
  const router = useRouter();
  const [deleting, setDeleting] = useState<AccessProfileFormValues | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch(
        `/api/admin/access-profiles/${encodeURIComponent(deleting.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(t(accessProfileError(result.error)));
        return;
      }
      setDeleting(null);
      router.refresh();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("admin")}</div>
          <h1>{t("accessProfiles")}</h1>
          <p className="muted page-description">
            {t("accessProfilesDescription")}
          </p>
        </div>
        <Link className="button" href="/admin/access-profiles/new">
          {t("addAccessProfile")}
        </Link>
      </div>
      {saved && (
        <p className="notice notice-success">
          {t(
            saved === "created"
              ? "accessProfileCreated"
              : "accessProfileUpdated",
          )}
        </p>
      )}
      <section className="card table-wrap">
        {profiles.length === 0 ? (
          <p className="muted">{t("noAccessProfiles")}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("name")}</th>
                <th>{t("accessProfileAudience")}</th>
                <th>{t("accessProfileAssigned")}</th>
                <th>{t("accessProfilePermissions")}</th>
                <th>{t("accessProfileManagedGroups")}</th>
                <th>
                  <span className="sr-only">{t("actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.id}>
                  <td>
                    {profile.name}{" "}
                    {profile.description && (
                      <InfoTip text={profile.description} />
                    )}
                  </td>
                  <td>{t(`accessProfileAudience_${profile.audience}`)}</td>
                  <td>{profile.assignedUsers}</td>
                  <td>{profile.permissions.length}</td>
                  <td>{scopeText(profile)}</td>
                  <td>
                    <div className="row-actions">
                      <Link
                        className="table-action icon-action"
                        aria-label={t("edit")}
                        title={t("edit")}
                        href={`/admin/access-profiles/${encodeURIComponent(profile.id)}/edit`}
                      >
                        <ActionIcon type="edit" />
                      </Link>
                      <button
                        className="table-action table-action-danger icon-action"
                        aria-label={t("delete")}
                        title={t("delete")}
                        onClick={() => {
                          setError("");
                          setDeleting(profile);
                        }}
                      >
                        <ActionIcon type="delete" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {deleting && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal modal-small"
            role="dialog"
            aria-modal="true"
            aria-labelledby="access-profile-delete-title"
          >
            <div className="modal-header">
              <h2 id="access-profile-delete-title">
                {t("deleteAccessProfile")}
              </h2>
              <button
                className="modal-close"
                type="button"
                aria-label={t("close")}
                onClick={() => setDeleting(null)}
              >
                &times;
              </button>
            </div>
            <p>
              {t("deleteAccessProfileDescription").replace(
                "{name}",
                deleting.name,
              )}
            </p>
            {error && (
              <p className="notice notice-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setDeleting(null)}
              >
                {t("cancel")}
              </button>
              <button
                className="button danger"
                type="button"
                disabled={busy}
                onClick={() => void remove()}
              >
                {busy ? t("deleting") : t("delete")}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
