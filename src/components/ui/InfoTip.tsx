"use client";

/**
 * Round "i" icon placed after a field label; shows `text` on hover, keyboard
 * focus or tap. It is a span, not a button, so the surrounding <label> still
 * labels its form control, and clicks do not open or toggle that control.
 */
export function InfoTip({ text }: { text: string }) {
  return (
    <span
      className="info-tip"
      tabIndex={0}
      role="img"
      aria-label={text}
      onClick={(event) => event.preventDefault()}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15">
        <circle cx="12" cy="12" r="9.5" />
        <path d="M12 11v5.5M12 7.6v.2" />
      </svg>
      <span className="info-tip-text" aria-hidden="true">
        {text}
      </span>
    </span>
  );
}
