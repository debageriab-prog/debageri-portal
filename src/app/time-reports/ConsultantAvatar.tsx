"use client";

import { useState } from "react";

export function ConsultantAvatar({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  const [available, setAvailable] = useState(true);

  return (
    <span className="consultant-avatar">
      {available ? (
        // Avatars are served by an authenticated, organization-scoped endpoint.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/users/${encodeURIComponent(userId)}/avatar`}
          alt=""
          onError={() => setAvailable(false)}
        />
      ) : (
        displayName.charAt(0).toUpperCase()
      )}
    </span>
  );
}
