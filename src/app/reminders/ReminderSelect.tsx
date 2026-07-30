"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";

export function ReminderSelect({
  users,
  selectedUserId,
}: {
  users: Array<{ id: string; displayName: string }>;
  selectedUserId?: string;
}) {
  const router = useRouter();
  const { t } = useLocale();
  return (
    <label>
      {t("employee")}
      <select
        className="field"
        value={selectedUserId ?? ""}
        onChange={(event) =>
          router.push(
            event.target.value
              ? `/reminders?userId=${encodeURIComponent(event.target.value)}`
              : "/reminders",
          )
        }
      >
        <option value="">{t("selectEmployee")}</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}
