"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import { InfoTip } from "@/components/ui/InfoTip";
import type { UserGroupStatus } from "@/domain/access/groups";
import { appCheckFetch } from "@/lib/firebase/client";
import type { MessageKey } from "@/lib/localization/messages";

export type UserGroupFormValues = {
  id: string;
  name: string;
  description: string;
  status: UserGroupStatus;
  members: number;
};

export const userGroupError = (code?: string) =>
  `userGroupError_${code ?? "saveFailed"}` as MessageKey;

export function UserGroupForm({ group }: { group?: UserGroupFormValues }) {
  const { t } = useLocale();
  const router = useRouter();
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [status, setStatus] = useState<UserGroupStatus>(
    group?.status ?? "active",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await appCheckFetch(
        group
          ? `/api/admin/user-groups/${encodeURIComponent(group.id)}`
          : "/api/admin/user-groups",
        {
          method: group ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, description, status }),
        },
      );
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(t(userGroupError(result.error)));
        return;
      }
      router.push(`/admin/groups?saved=${group ? "updated" : "created"}`);
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
      {group && group.status === "active" && status === "disabled" && (
        <p className="notice notice-warning">{t("userGroupDisableWarning")}</p>
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
          {t("status")} <InfoTip text={t("userGroupStatusTip")} />
        </span>
        <select
          className="field"
          value={status}
          onChange={(event) => setStatus(event.target.value as UserGroupStatus)}
        >
          <option value="active">{t("userGroupStatus_active")}</option>
          <option value="disabled">{t("userGroupStatus_disabled")}</option>
        </select>
      </label>
      <div className="actions">
        <Link className="button secondary" href="/admin/groups">
          {t("cancel")}
        </Link>
        <button className="button" type="submit" disabled={busy}>
          {busy ? t("saving") : t("saveUserGroup")}
        </button>
      </div>
    </form>
  );
}
