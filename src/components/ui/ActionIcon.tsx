export type ActionIconType = "edit" | "delete" | "password";

export function ActionIcon({ type }: { type: ActionIconType }) {
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
  return (
    <svg className="action-icon-svg" aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
    </svg>
  );
}
