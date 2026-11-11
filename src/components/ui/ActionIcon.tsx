export type ActionIconType =
  | "edit"
  | "delete"
  | "password"
  | "reverse"
  | "mfa"
  | "viewAs"
  | "copy"
  | "copied"
  | "previous"
  | "next"
  | "excel"
  | "pdf"
  | "paid"
  | "info"
  | "more";

export function ActionIcon({ type }: { type: ActionIconType }) {
  if (type === "excel" || type === "pdf")
    return (
      <svg
        className={`action-icon-svg file-type-icon file-type-${type}`}
        aria-hidden="true"
        viewBox="0 0 24 24"
      >
        <path d="M5 20V4a1 1 0 0 1 1-1h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z" />
        <path d="M14 3v5h5" />
        <text x="12" y="17.6" textAnchor="middle">
          {type === "excel" ? "XLS" : "PDF"}
        </text>
      </svg>
    );
  if (type === "info")
    return (
      <svg className="action-icon-svg" aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8v.01" />
      </svg>
    );
  if (type === "paid")
    return (
      <svg className="action-icon-svg" aria-hidden="true" viewBox="0 0 24 24">
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.75" />
        <path d="M6.5 9.5v.01M17.5 14.5v.01" />
      </svg>
    );
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
  if (type === "viewAs")
    return (
      <svg className="action-icon-svg" aria-hidden="true" viewBox="0 0 24 24">
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
        <circle cx="12" cy="12" r="2.75" />
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
  if (type === "more")
    return (
      <svg className="action-icon-svg" aria-hidden="true" viewBox="0 0 24 24">
        <path strokeWidth={3} d="M12 5v.01M12 12v.01M12 19v.01" />
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
