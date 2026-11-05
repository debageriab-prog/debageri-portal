import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminServices } from "@/lib/firebase/admin";
import { getServerLocale, getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import {
  exportTimeReport,
  TimeReportExportError,
} from "@/server/services/time-report-export-service";

const querySchema = z.object({
  userId: z.string().min(1).max(128),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12).optional(),
  format: z.enum(["xlsx", "pdf"]).default("xlsx"),
});

function monthNames(locale: string) {
  const format = new Intl.DateTimeFormat(locale, {
    month: "long",
    timeZone: "UTC",
  });
  return Array.from({ length: 12 }, (_, index) => {
    const name = format.format(new Date(Date.UTC(2000, index, 1)));
    return name.charAt(0).toUpperCase() + name.slice(1);
  });
}

export async function GET(request: Request) {
  const actor = await verifySession();
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    userId: params.get("userId") ?? undefined,
    year: params.get("year") ?? undefined,
    month: params.get("month") || undefined,
    format: params.get("format") || undefined,
  });
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const { userId, year, month, format } = parsed.data;
  const [t, locale] = await Promise.all([getTranslator(), getServerLocale()]);
  try {
    const { fileName, contentType, data } = await exportTimeReport(
      getAdminServices().db,
      actor,
      userId,
      { year, month },
      {
        dayOfMonth: t("dayOfMonth"),
        total: t("total"),
        totalPossible: t("totalPossible"),
        monthNames: monthNames(locale),
        emptySheet: t("worked"),
      },
      format,
    );
    const asciiName = fileName.normalize("NFD").replace(/[^\x20-\x7e]/g, "");
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": contentType,
        "content-disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof TimeReportExportError)
      return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("Time report export failed", { userId, error });
    return NextResponse.json(
      { error: "timeReportExportFailed" },
      { status: 500 },
    );
  }
}
