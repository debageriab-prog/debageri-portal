"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  normalizePermissions,
  type PermissionKey,
  type ProfileAudience,
} from "@/domain/access/permissions";
import {
  COMPANY_GROUP_ID,
  type ProfileScope,
  type UserGroupStatus,
} from "@/domain/access/groups";
import { appCheckFetch } from "@/lib/firebase/client";
import type { MessageKey } from "@/lib/localization/messages";
import { PermissionTree } from "./PermissionTree";

export type AccessProfileFormValues = {
  id: string;
  name: string;
  description: string;
  audience: ProfileAudience;
  permissions: PermissionKey[];
  defaultForRole: string | null;
  assignedUsers: number;
  scope: ProfileScope;
  groupIds: string[];
};

export type GroupChoice = {
  id: string;
  name: string;
  description: string;
  status: UserGroupStatus;
};

export const accessProfileError = (code?: string) =>
  `accessProfileError_${code ?? "saveFailed"}` as MessageKey;

export function AccessProfileForm({
  profile,
  groups,
}: {
  profile?: AccessProfileFormValues;
  groups: GroupChoice[];
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [name, setName] = useState(profile?.name ?? "");
  const [description, setDescription] = useState(profile?.description ?? "");
  const [audience, setAudience] = useState<ProfileAudience>(
    profile?.audience ?? "staff",
  );
  const [permissions, setPermissions] = useState<PermissionKey[]>(
    profile?.permissions ?? [],
  );
  const [scope, setScope] = useState<ProfileScope>(profile?.scope ?? "all");
  const [groupIds, setGroupIds] = useState<string[]>(profile?.groupIds ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const audienceLocked =
    Boolean(profile?.defaultForRole) || (profile?.assignedUsers ?? 0) > 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch(
        profile
          ? `/api/admin/access-profiles/${encodeURIComponent(profile.id)}`
          : "/api/admin/access-profiles",
        {
          method: profile ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            description,
            audience,
            permissions,
            scope,
            groupIds: scope === "groups" ? groupIds : [],
          }),
        },
      );
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(t(accessProfileError(result.error)));
        return;
      }
      router.push(
        `/admin/access-profiles?saved=${profile ? "updated" : "created"}`,
      );
      router.refresh();
    } catch {
      setError(t("serverUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card access-profile-form" onSubmit={submit}>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      {(profile?.assignedUsers ?? 0) > 0 && (
        <p className="notice notice-warning">
          {t("accessProfileChangeWarning").replace(
            "{count}",
            String(profile!.assignedUsers),
          )}
        </p>
      )}
      <label>
        {t("name")}
        <input
          className="field"
          value={name}
          required
          minLength={2}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        {t("description")}
        <input
          className="field"
          value={description}
          maxLength={300}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <label>
        <span>
          {t("accessProfileAudience")}{" "}
          <InfoTip text={t("accessProfileAudienceTip")} />
        </span>
        <select
          className="field"
          value={audience}
          disabled={audienceLocked}
          onChange={(event) => {
            const next = event.target.value as ProfileAudience;
            setAudience(next);
            setPermissions((current) => normalizePermissions(current, next));
          }}
        >
          <option value="staff">{t("accessProfileAudience_staff")}</option>
          <option value="consultant">
            {t("accessProfileAudience_consultant")}
          </option>
        </select>
      </label>
      <PermissionTree
        audience={audience}
        selected={permissions}
        onChange={setPermissions}
      />
      {audience === "staff" && (
        <fieldset className="access-section">
          <legend>
            {t("accessProfileManagedGroups")}{" "}
            <InfoTip text={t("accessProfileManagedGroupsTip")} />
          </legend>
          <label className="checkbox-row">
            <input
              type="radio"
              name="profile-scope"
              checked={scope === "all"}
              onChange={() => setScope("all")}
            />
            <span>{t("accessProfileScope_all")}</span>
          </label>
          <label className="checkbox-row">
            <input
              type="radio"
              name="profile-scope"
              checked={scope === "groups"}
              onChange={() => setScope("groups")}
            />
            <span>{t("accessProfileScope_groups")}</span>
          </label>
          {scope === "groups" && (
            <div className="access-children">
              {[
                {
                  id: COMPANY_GROUP_ID,
                  name: t("companyGroupName"),
                  description: t("companyGroupDescription"),
                  status: "active" as const,
                },
                ...groups.filter(
                  (group) =>
                    group.status === "active" || groupIds.includes(group.id),
                ),
              ].map((group) => (
                <label className="checkbox-row" key={group.id}>
                  <input
                    type="checkbox"
                    checked={groupIds.includes(group.id)}
                    onChange={(event) =>
                      setGroupIds((current) =>
                        event.target.checked
                          ? [...current, group.id]
                          : current.filter((id) => id !== group.id),
                      )
                    }
                  />
                  <span>
                    {group.name}
                    {group.status === "disabled" &&
                      ` (${t("userGroupStatus_disabled")})`}
                  </span>
                  {group.description && <InfoTip text={group.description} />}
                </label>
              ))}
              {groupIds.length === 0 && (
                <p className="notice notice-warning">
                  {t("accessProfileNoGroups")}
                </p>
              )}
            </div>
          )}
        </fieldset>
      )}
      <div className="actions">
        <Link className="button secondary" href="/admin/access-profiles">
          {t("cancel")}
        </Link>
        <button className="button" type="submit" disabled={busy}>
          {busy ? t("saving") : t("saveAccessProfile")}
        </button>
      </div>
    </form>
  );
}
