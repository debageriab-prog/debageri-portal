"use client";

import { useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

const TIP_WIDTH = 280;
const POINTER_GAP = 14;
const VIEWPORT_MARGIN = 8;
/** Below this distance from the top the tip opens under the pointer. */
const MIN_SPACE_ABOVE = 120;

function tipPosition(x: number, y: number): CSSProperties {
  const above = y > MIN_SPACE_ABOVE;
  return {
    left: Math.max(
      VIEWPORT_MARGIN,
      Math.min(
        x + POINTER_GAP,
        window.innerWidth - TIP_WIDTH - VIEWPORT_MARGIN,
      ),
    ),
    top: above ? y - POINTER_GAP : y + POINTER_GAP,
    transform: above ? "translateY(-100%)" : undefined,
  };
}

/**
 * Round "i" icon placed after a field label; shows `text` next to the pointer
 * on hover, or next to the icon on keyboard focus or tap. It is a span, not a
 * button, so the surrounding <label> still labels its form control, and clicks
 * do not open or toggle that control. The tip renders on the body so scrolling
 * tables, cards and modals cannot clip or offset it.
 */
export function InfoTip({ text }: { text: string }) {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  return (
    <span
      className="info-tip"
      tabIndex={0}
      role="img"
      aria-label={text}
      onClick={(event) => event.preventDefault()}
      onMouseEnter={(event) =>
        setStyle(tipPosition(event.clientX, event.clientY))
      }
      onMouseMove={(event) =>
        setStyle(tipPosition(event.clientX, event.clientY))
      }
      onMouseLeave={() => setStyle(null)}
      onFocus={(event) => {
        const icon = event.currentTarget.getBoundingClientRect();
        setStyle(tipPosition(icon.right, icon.top));
      }}
      onBlur={() => setStyle(null)}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15">
        <circle cx="12" cy="12" r="9.5" />
        <path d="M12 11v5.5M12 7.6v.2" />
      </svg>
      {style &&
        createPortal(
          <span className="info-tip-text" aria-hidden="true" style={style}>
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}
