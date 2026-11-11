import { inflateSync } from "node:zlib";

/**
 * Reads the 8-bit RGBA PNGs a browser canvas makes and keeps the alpha
 * channel: for a signature that is the ink, whatever colour it was drawn in.
 * Anything else (other colour types, interlacing, oversized images) is
 * refused rather than guessed at.
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class PngError extends Error {}

export interface PngAlpha {
  width: number;
  height: number;
  /** One byte per pixel, row by row from the top: 0 is no ink, 255 full. */
  alpha: Buffer;
}

export function pngAlpha(
  png: Buffer,
  limits: { maxWidth: number; maxHeight: number },
): PngAlpha {
  if (png.length < 33 || !png.subarray(0, 8).equals(SIGNATURE))
    throw new PngError("notPng");
  let offset = 8;
  let width = 0;
  let height = 0;
  const data: Buffer[] = [];
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("latin1", offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (body.length !== length) throw new PngError("truncated");
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [depth, colour, , , interlace] = body.subarray(8, 13);
      if (depth !== 8 || colour !== 6 || interlace !== 0)
        throw new PngError("unsupported");
      if (
        width < 1 ||
        height < 1 ||
        width > limits.maxWidth ||
        height > limits.maxHeight
      )
        throw new PngError("size");
    } else if (type === "IDAT") data.push(body);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (!width || !data.length) throw new PngError("empty");
  const stride = width * 4;
  const raw = inflateSync(Buffer.concat(data), {
    maxOutputLength: (stride + 1) * height,
  });
  if (raw.length !== (stride + 1) * height) throw new PngError("truncated");

  const alpha = Buffer.alloc(width * height);
  let previous = Buffer.alloc(stride);
  for (let row = 0; row < height; row += 1) {
    const start = row * (stride + 1);
    const filter = raw[start]!;
    const line = Buffer.from(raw.subarray(start + 1, start + 1 + stride));
    for (let i = 0; i < stride; i += 1) {
      const left = i >= 4 ? line[i - 4]! : 0;
      const up = previous[i]!;
      const upLeft = i >= 4 ? previous[i - 4]! : 0;
      let add = 0;
      if (filter === 1) add = left;
      else if (filter === 2) add = up;
      else if (filter === 3) add = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        add = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else if (filter !== 0) throw new PngError("filter");
      line[i] = (line[i]! + add) & 0xff;
    }
    for (let x = 0; x < width; x += 1)
      alpha[row * width + x] = line[x * 4 + 3]!;
    previous = line;
  }
  return { width, height, alpha };
}
