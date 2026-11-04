import type { ReactNode } from "react";

/**
 * Building blocks for detail popups: a summary card with the key figure,
 * titled section cards of label/value rows, and file rows. Use them inside
 * `section.modal.detail-modal`.
 */

export type DetailTone =
  "neutral" | "income" | "expense" | "positive" | "negative";

export function DetailSummary({
  tone = "neutral",
  tags,
  amount,
  headline,
  children,
}: {
  tone?: DetailTone;
  tags?: ReactNode;
  amount?: ReactNode;
  headline?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`detail-summary detail-summary-${tone}`}>
      {tags && <div className="detail-tags">{tags}</div>}
      {amount != null && amount !== "" && (
        <strong className="detail-amount">{amount}</strong>
      )}
      {headline && <span className="detail-headline">{headline}</span>}
      {children && <div className="detail-summary-text">{children}</div>}
    </div>
  );
}

export function DetailTag({
  tone = "neutral",
  children,
}: {
  tone?: DetailTone;
  children: ReactNode;
}) {
  return <span className={`detail-tag detail-tag-${tone}`}>{children}</span>;
}

/** Section cards side by side, wrapping to one column on narrow screens. */
export function DetailSections({ children }: { children: ReactNode }) {
  return <div className="detail-sections">{children}</div>;
}

export function DetailSection({
  title,
  count,
  children,
}: {
  title: ReactNode;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="detail-section">
      <h3>
        {title}
        {count != null && <span className="detail-count">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

/** A label/value pair, or a falsy value for a row that does not apply. */
export type DetailRow =
  [label: string, value: ReactNode] | null | undefined | false | "";

function shownRows(rows: DetailRow[]) {
  return rows.filter(
    (row): row is [string, ReactNode] =>
      Boolean(row) &&
      (row as [string, ReactNode])[1] != null &&
      (row as [string, ReactNode])[1] !== "",
  );
}

/** Label/value rows; rows without a value are left out. */
export function DetailFacts({ rows }: { rows: DetailRow[] }) {
  return (
    <dl className="detail-facts">
      {shownRows(rows).map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** True when at least one row would be shown, so empty sections can be skipped. */
export function hasDetailRows(rows: DetailRow[]) {
  return shownRows(rows).length > 0;
}

/** A short label such as PDF or JPG for the file badge. */
export function fileTypeLabel(name: string, contentType = "") {
  const extension = /\.([a-z0-9]{1,4})$/i.exec(name)?.[1];
  return (extension ?? contentType.split("/")[1] ?? "file")
    .slice(0, 4)
    .toUpperCase();
}

export function fileSizeLabel(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DetailFiles({ children }: { children: ReactNode }) {
  return <ul className="detail-files">{children}</ul>;
}

/** One file with its type badge, name, size and action buttons. */
export function DetailFile({
  name,
  contentType,
  size,
  children,
}: {
  name: string;
  contentType?: string;
  size?: number;
  children?: ReactNode;
}) {
  return (
    <li className="detail-file">
      <span className="detail-file-type">
        {fileTypeLabel(name, contentType)}
      </span>
      <span className="detail-file-name">
        <strong title={name}>{name}</strong>
        {size != null && size > 0 && <small>{fileSizeLabel(size)}</small>}
      </span>
      {children}
    </li>
  );
}

/** Long text, such as an email body, folded away until opened. */
export function DetailCollapsible({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="detail-collapsible">
      <summary>{title}</summary>
      <div className="detail-collapsible-body">{children}</div>
    </details>
  );
}
