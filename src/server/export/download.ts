import { z } from "zod";

/** What the report export routes share: their query, months and response. */

const exportQuerySchema = z.object({
  userId: z.string().min(1).max(128),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12).optional(),
  format: z.enum(["xlsx", "pdf"]).default("xlsx"),
});

export function parseExportQuery(request: Request) {
  const params = new URL(request.url).searchParams;
  return exportQuerySchema.safeParse({
    userId: params.get("userId") ?? undefined,
    year: params.get("year") ?? undefined,
    month: params.get("month") || undefined,
    format: params.get("format") || undefined,
  });
}

/** January to December, capitalised, in the reader's language. */
export function monthNames(locale: string) {
  const format = new Intl.DateTimeFormat(locale, {
    month: "long",
    timeZone: "UTC",
  });
  return Array.from({ length: 12 }, (_, index) => {
    const name = format.format(new Date(Date.UTC(2000, index, 1)));
    return name.charAt(0).toUpperCase() + name.slice(1);
  });
}

export function downloadResponse(
  fileName: string,
  contentType: string,
  data: Buffer,
) {
  const asciiName = fileName.normalize("NFD").replace(/[^\x20-\x7e]/g, "");
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "cache-control": "private, no-store",
    },
  });
}
