import { NextResponse } from "next/server";
import { getAdminServices } from "@/lib/firebase/admin";
import { getServerLocale, getTranslator } from "@/lib/localization/server";
import { verifySession } from "@/server/auth/session";
import {
  downloadResponse,
  monthNames,
  parseExportQuery,
} from "@/server/export/download";
import {
  exportTimeReport,
  TimeReportExportError,
} from "@/server/services/time-report-export-service";

export async function GET(request: Request) {
  const actor = await verifySession();
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = parseExportQuery(request);
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
    return downloadResponse(fileName, contentType, data);
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
