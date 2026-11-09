import { deflateSync } from "node:zlib";

/**
 * The small PDF toolkit every export shares: Helvetica text measured with its
 * standard widths, filled and outlined table cells, and the document wrapper.
 * Only the standard fonts are used, so nothing is embedded.
 */

export const PDF_CONTENT_TYPE = "application/pdf";

/** Helvetica advance widths for character codes 32 to 126, in 1/1000 em. */
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];

/** Helvetica-Bold advance widths for character codes 32 to 126. */
const HELVETICA_BOLD_WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584,
  584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
  278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278,
  556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556,
  500, 389, 280, 389, 584,
];

/** Common typography outside Latin-1, by code point, as Latin-1 text. */
const LATIN1_SUBSTITUTES = new Map<number, string>([
  [0x2010, "-"], // hyphen
  [0x2011, "-"], // non-breaking hyphen
  [0x2012, "-"], // figure dash
  [0x2013, "-"], // en dash
  [0x2014, "-"], // em dash
  [0x2212, "-"], // minus sign
  [0x2018, "'"],
  [0x2019, "'"],
  [0x201c, '"'],
  [0x201d, '"'],
  [0x2026, "..."],
  [0x2022, String.fromCharCode(0xb7)], // bullet as a middle dot
  [0x202f, String.fromCharCode(0xa0)], // narrow no-break space
  [0x2009, " "], // thin space
]);

/** Keeps what the standard fonts can show (Latin-1) and swaps the rest. */
export function pdfText(value: string) {
  const substituted = [...value.normalize("NFC")]
    .map((char) => LATIN1_SUBSTITUTES.get(char.codePointAt(0)!) ?? char)
    .join("");
  return [...substituted]
    .map((char) => {
      const code = char.codePointAt(0)!;
      return (code >= 32 && code <= 126) || (code >= 160 && code <= 255)
        ? char
        : "?";
    })
    .join("");
}

function charWidth(char: string, widths: number[]) {
  const code = char.charCodeAt(0);
  if (code >= 32 && code <= 126) return widths[code - 32]!;
  // A non-breaking space is as wide as a space.
  if (code === 160) return widths[0]!;
  const base = char.normalize("NFD").charCodeAt(0);
  return base >= 32 && base <= 126 ? widths[base - 32]! : 556;
}

/** Courier draws every character 600/1000 em wide. */
const MONO_WIDTH = 600;

export function textWidth(
  value: string,
  size: number,
  bold = false,
  mono = false,
) {
  if (mono) return ([...value].length * MONO_WIDTH * size) / 1000;
  const widths = bold ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
  const width = [...value].reduce(
    (sum, char) => sum + charWidth(char, widths),
    0,
  );
  return (width * size) / 1000;
}

const escape = (value: string) => value.replace(/([\\()])/g, "\\$1");
const rgb = (hex: string) =>
  [0, 2, 4]
    .map((start) =>
      (parseInt(hex.slice(start, start + 2), 16) / 255).toFixed(3),
    )
    .join(" ");
export const pdfNumber = (value: number) =>
  String(Math.round(value * 100) / 100);
const num = pdfNumber;

export type TextOptions = {
  bold?: boolean;
  /** Courier Bold, for machine-read lines; at 12 pt, ten characters per inch. */
  mono?: boolean;
  color?: string;
  align?: "left" | "center" | "right";
  /** The box the text is aligned in, for center and right. */
  width?: number;
};

export type CellOptions = {
  fill?: string;
  bold?: boolean;
  border?: boolean;
  color?: string;
  align?: "left" | "center" | "right";
};

/** Draws on one page, measuring from the top left like a screen. */
export class PdfPage {
  private readonly ops: string[] = ["0.5 w 0 0 0 RG"];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  text(
    value: string,
    x: number,
    top: number,
    size: number,
    options: TextOptions = {},
  ) {
    const {
      bold = false,
      mono = false,
      color = "000000",
      align = "left",
      width = 0,
    } = options;
    const clean = pdfText(value);
    const measured = textWidth(clean, size, bold, mono);
    const offset =
      align === "center"
        ? (width - measured) / 2
        : align === "right"
          ? width - measured
          : 0;
    this.ops.push(
      `BT /${mono ? "F3" : bold ? "F2" : "F1"} ${num(size)} Tf ${rgb(color)} rg ${num(x + offset)} ${num(this.height - top - size)} Td (${escape(clean)}) Tj ET`,
    );
  }

  /** A table cell with optional fill and outline, its text centred upright. */
  cell(
    x: number,
    top: number,
    width: number,
    height: number,
    value: string,
    fontSize: number,
    options: CellOptions = {},
  ) {
    const {
      fill,
      bold = false,
      border = true,
      color,
      align = "center",
    } = options;
    const y = this.height - top - height;
    if (fill)
      this.ops.push(
        `${rgb(fill)} rg ${num(x)} ${num(y)} ${num(width)} ${num(height)} re f`,
      );
    if (border)
      this.ops.push(`${num(x)} ${num(y)} ${num(width)} ${num(height)} re S`);
    if (!value) return;
    const padding = align === "center" ? 2 : 4;
    const room = width - 2 * padding;
    // Text that would spill over the cell edge is set smaller to fit.
    const size = Math.min(
      fontSize,
      (fontSize * room) /
        Math.max(textWidth(pdfText(value), fontSize, bold), 1),
    );
    this.text(
      value,
      x + padding,
      top + (height - size * 0.7) / 2 - size * 0.3,
      size,
      { bold, color, align, width: room },
    );
  }

  /** A straight line, measured from the top left like the text. */
  line(
    x1: number,
    top1: number,
    x2: number,
    top2: number,
    options: { color?: string; width?: number; dash?: number[] } = {},
  ) {
    const { color = "000000", width = 0.5, dash } = options;
    const pattern = dash ? `[${dash.map(num).join(" ")}] 0 d ` : "";
    this.ops.push(
      `q ${num(width)} w ${pattern}${rgb(color)} RG ${num(x1)} ${num(this.height - top1)} m ${num(x2)} ${num(this.height - top2)} l S Q`,
    );
  }

  /** A filled or outlined rectangle without text. */
  rect(
    x: number,
    top: number,
    width: number,
    height: number,
    options: { fill?: string; stroke?: string } = {},
  ) {
    const y = this.height - top - height;
    const box = `${num(x)} ${num(y)} ${num(width)} ${num(height)} re`;
    if (options.fill) this.ops.push(`q ${rgb(options.fill)} rg ${box} f Q`);
    if (options.stroke)
      this.ops.push(`q 0.5 w ${rgb(options.stroke)} RG ${box} S Q`);
  }

  content() {
    return this.ops.join("\n");
  }
}

/** Splits text into lines no wider than `width`, keeping its own breaks. */
export function wrapText(
  value: string,
  width: number,
  size: number,
  bold = false,
) {
  const lines: string[] = [];
  for (const paragraph of value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(pdfText)) {
    let current = "";
    for (const word of paragraph.split(/ +/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (!current || textWidth(candidate, size, bold) <= width) {
        current = candidate;
        continue;
      }
      lines.push(current);
      current = word;
    }
    lines.push(current);
  }
  return lines;
}

/** Wraps finished pages in a PDF with Helvetica and Helvetica-Bold. */
export function pdfDocument(pages: readonly PdfPage[]): Buffer {
  const objects: Buffer[] = [];
  const add = (body: Buffer | string) =>
    objects.push(typeof body === "string" ? Buffer.from(body, "latin1") : body);
  const pageIds = pages.map((_, index) => 6 + index * 2);
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );
  add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );
  add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>",
  );
  pages.forEach((page, index) => {
    const content = deflateSync(Buffer.from(page.content(), "latin1"));
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${pageIds[index]! + 1} 0 R >>`,
    );
    add(
      Buffer.concat([
        Buffer.from(
          `<< /Length ${content.length} /Filter /FlateDecode >>\nstream\n`,
          "latin1",
        ),
        content,
        Buffer.from("\nendstream", "latin1"),
      ]),
    );
  });

  const parts: Buffer[] = [
    Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1"),
  ];
  let offset = parts[0]!.length;
  const offsets = objects.map((body, index) => {
    const start = offset;
    const chunk = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, "latin1"),
      body,
      Buffer.from("\nendobj\n", "latin1"),
    ]);
    parts.push(chunk);
    offset += chunk.length;
    return start;
  });
  const xref = [
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`,
    ...offsets.map((start) => `${String(start).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`,
  ].join("");
  parts.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(parts);
}
