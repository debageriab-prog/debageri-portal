"use client";

import { useRouter } from "next/navigation";

export function ConsultantSelect({
  users,
  selectedUserId,
  label,
}: {
  users: Array<{ id: string; displayName: string }>;
  selectedUserId?: string;
  label: string;
}) {
  const router = useRouter();

  return (
    <label>
      {label}
      <select
        className="field"
        value={selectedUserId ?? ""}
        onChange={(event) => {
          const id = event.target.value;
          router.push(
            id
              ? `/time-reports?userId=${encodeURIComponent(id)}`
              : "/time-reports",
          );
        }}
      >
        <option value="">All consultants</option>
        {users.map((user) => (
          <option value={user.id} key={user.id}>
            {user.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}
