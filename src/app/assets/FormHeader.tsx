import Link from "next/link";

/** The heading of an asset form page, with the way back above it. */
export function FormHeader({
  backHref,
  backLabel,
  title,
  description,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="topbar">
      <div>
        <Link className="text-link" href={backHref}>
          ← {backLabel}
        </Link>
        <h1>{title}</h1>
        {description && <p className="muted page-description">{description}</p>}
      </div>
    </div>
  );
}
