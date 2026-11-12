"use client";

import { Allura, Dancing_Script, Great_Vibes } from "next/font/google";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  hasSignatureInk,
  SIGNATURE_MAX_HEIGHT,
  SIGNATURE_MAX_WIDTH,
  type SignatureMethod,
} from "@/domain/assets";

const allura = Allura({ weight: "400", subsets: ["latin"] });
const greatVibes = Great_Vibes({ weight: "400", subsets: ["latin"] });
const dancingScript = Dancing_Script({ weight: "500", subsets: ["latin"] });

/** The script fonts a typed signature can be shown in. */
const STYLES = [allura, greatVibes, dancingScript];

const INK = "#1f2a44";
/** The drawing box, in canvas pixels; it is shown scaled to the page. */
const PAD_WIDTH = 900;
const PAD_HEIGHT = 300;

export interface SignatureHandle {
  /** The signature as a trimmed PNG data URL, or null when there is none. */
  image(): Promise<{ method: SignatureMethod; image: string } | null>;
}

/** Cuts the canvas down to the ink, with a little room around it. */
function trimmed(source: HTMLCanvasElement) {
  const context = source.getContext("2d")!;
  const { width, height } = source;
  const pixels = context.getImageData(0, 0, width, height).data;
  const alpha = new Uint8Array(width * height);
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const value = pixels[(y * width + x) * 4 + 3]!;
      alpha[y * width + x] = value;
      if (value < 16) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  if (right < 0 || !hasSignatureInk(alpha)) return null;
  const margin = 12;
  left = Math.max(0, left - margin);
  top = Math.max(0, top - margin);
  right = Math.min(width - 1, right + margin);
  bottom = Math.min(height - 1, bottom + margin);
  const cropWidth = right - left + 1;
  const cropHeight = bottom - top + 1;
  const scale = Math.min(
    1,
    SIGNATURE_MAX_WIDTH / cropWidth,
    SIGNATURE_MAX_HEIGHT / cropHeight,
  );
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cropWidth * scale));
  out.height = Math.max(1, Math.round(cropHeight * scale));
  out
    .getContext("2d")!
    .drawImage(
      source,
      left,
      top,
      cropWidth,
      cropHeight,
      0,
      0,
      out.width,
      out.height,
    );
  return out.toDataURL("image/png");
}

/**
 * Lets the recipient sign a receipt, either by drawing in a box or by typing
 * their name, shown in a handwriting-style font. Either way the signature is
 * sent as an image and printed on the receipt PDF.
 */
export function SignatureField({
  defaultName,
  onChange,
  ref,
}: {
  defaultName: string;
  /** Called with whether there is a signature to send. */
  onChange: (ready: boolean) => void;
  ref: Ref<SignatureHandle>;
}) {
  const { t } = useLocale();
  const [method, setMethod] = useState<SignatureMethod>("drawn");
  const [name, setName] = useState(defaultName);
  const [style, setStyle] = useState(0);
  const [drawn, setDrawn] = useState(false);
  const pad = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    onChange(method === "drawn" ? drawn : name.trim().length > 0);
  }, [method, drawn, name, onChange]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * PAD_WIDTH,
      y: ((event.clientY - box.top) / box.height) * PAD_HEIGHT,
    };
  };

  const stroke = (to: { x: number; y: number }) => {
    const context = pad.current?.getContext("2d");
    const from = last.current;
    if (!context || !from) return;
    context.strokeStyle = INK;
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    last.current = to;
  };

  const clear = useCallback(() => {
    const canvas = pad.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setDrawn(false);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      async image() {
        if (method === "drawn") {
          const image = pad.current && trimmed(pad.current);
          return image ? { method, image } : null;
        }
        const text = name.trim();
        if (!text) return null;
        const font = STYLES[style]!.style.fontFamily;
        await document.fonts.load(`96px ${font}`, text);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d")!;
        context.font = `96px ${font}`;
        canvas.width = Math.min(
          SIGNATURE_MAX_WIDTH,
          Math.ceil(context.measureText(text).width) + 80,
        );
        canvas.height = 200;
        context.font = `96px ${font}`;
        context.fillStyle = INK;
        context.textBaseline = "middle";
        context.fillText(text, 40, 100, canvas.width - 80);
        const image = trimmed(canvas);
        return image ? { method, image } : null;
      },
    }),
    [method, name, style],
  );

  return (
    <fieldset className="signature-field">
      <legend>
        {t("handoverSignature")} <InfoTip text={t("handoverSignatureTip")} />
      </legend>
      <div
        className="editor-tabs"
        role="tablist"
        aria-label={t("handoverSignature")}
      >
        {(["drawn", "typed"] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            id={`signature-tab-${item}`}
            aria-controls={`signature-panel-${item}`}
            aria-selected={method === item}
            className={`editor-tab${method === item ? " active" : ""}`}
            onClick={() => setMethod(item)}
          >
            {t(
              item === "drawn"
                ? "handoverSignatureDraw"
                : "handoverSignatureType",
            )}
          </button>
        ))}
      </div>
      <div
        className="signature-panel"
        role="tabpanel"
        id="signature-panel-drawn"
        aria-labelledby="signature-tab-drawn"
        hidden={method !== "drawn"}
      >
        <p className="muted">{t("handoverSignatureDrawHint")}</p>
        <canvas
          ref={pad}
          className="signature-pad"
          width={PAD_WIDTH}
          height={PAD_HEIGHT}
          aria-label={t("handoverSignatureDrawHint")}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            last.current = point(event);
            // A tap leaves a dot, as a pen would.
            stroke({ x: last.current.x + 0.1, y: last.current.y + 0.1 });
          }}
          onPointerMove={(event) => {
            if (!last.current) return;
            stroke(point(event));
          }}
          onPointerUp={() => {
            last.current = null;
            const canvas = pad.current;
            if (canvas)
              setDrawn(
                hasSignatureInk(
                  canvas
                    .getContext("2d")!
                    .getImageData(0, 0, canvas.width, canvas.height)
                    .data.filter((_, index) => index % 4 === 3),
                ),
              );
          }}
          onPointerCancel={() => {
            last.current = null;
          }}
        />
        <div className="actions">
          <button type="button" className="button secondary" onClick={clear}>
            {t("handoverSignatureClear")}
          </button>
        </div>
      </div>
      <div
        className="signature-panel"
        role="tabpanel"
        id="signature-panel-typed"
        aria-labelledby="signature-tab-typed"
        hidden={method !== "typed"}
      >
        <label>
          {t("handoverSignatureName")}
          <input
            className="field"
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div
          className="signature-styles"
          role="radiogroup"
          aria-label={t("handoverSignatureStyle")}
        >
          {STYLES.map((font, index) => (
            <button
              key={font.style.fontFamily}
              type="button"
              role="radio"
              aria-checked={style === index}
              aria-label={t("handoverSignatureStyleOption").replace(
                "{number}",
                String(index + 1),
              )}
              className={`signature-style${style === index ? " active" : ""}`}
              onClick={() => setStyle(index)}
            >
              <span className={font.className}>
                {name.trim() || defaultName}
              </span>
            </button>
          ))}
        </div>
      </div>
    </fieldset>
  );
}
