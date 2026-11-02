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
};

export const accessProfileError = (code?: string) =>
  `accessProfileError_${code ?? "saveFailed"}` as MessageKey;

export function AccessProfileForm({
  profile,
}: {
  profile?: AccessProfileFormValues;
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
          body: JSON.stringify({ name, description, audience, permissions }),
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
