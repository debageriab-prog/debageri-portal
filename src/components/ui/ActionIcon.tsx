export type ActionIconType =
  | "edit"
  | "delete"
  | "password"
  | "reverse"
  | "mfa"
  | "copy"
  | "copied"
  | "previous"
  | "next";

export function ActionIcon({ type }: { type: ActionIconType }) {
  if (type === "previous")
    return (
      <svg className="action-icon-svg" aria-hidden="true" viewBox="0 0 24 24">
        <path d="m15 5-7 7 7 7" />
      </svg>
    );
  if (type === "next")
    return (
      <svg className="action-icon-svg" aria-hidden="true" viewBox="0 0 24 24">
        <path d="m9 5 7 7-7 7" />
      </svg>
    );
  if (type === "edit")
    return (
      <svg className="action-icon-svg" aria-hidden="true" viewBox="0 0 24 24">
        <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
        <path d="m14.5 7.5 3 3" />
      </svg>
    );
  if (type === "password")
    return (
      <svg className="action-icon-svg" aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="8" cy="15" r="4" />
        <path d="m11 12 8-8m-3 3 3 3m-6 0 2 2" />
      </svg>
    );
  if (type === "mfa")
    return (
      <svg className="action-icon-svg" aria-hidden="true" viewBox="0 0 24 24">
        <rect x="7" y="3" width="10" height="18" rx="2" />
        <path d="M11 18h2M10 10.5l1.5 1.5 3-3" />
      </svg>
    );
  if (type === "copy")
    return (
      <svg className="action-icon-svg" aria-hidden="true" viewBox="0 0 24 24">
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V6a2 2 0 0 1 2-2h8" />
      </svg>
    );
  if (type === "copied")
    return (
      <svg className="action-icon-svg" aria-hidden="true" viewBox="0 0 24 24">
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
    );
  if (type === "reverse")
    return (
      <svg className="action-icon-svg" aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4 9V4m0 0h5M4 4l4.2 4.2A7 7 0 1 1 6 15" />
      </svg>
    );
  return (
    <svg className="action-icon-svg" aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
    </svg>
  );
}
