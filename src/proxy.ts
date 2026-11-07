import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  IMPERSONATION_COOKIE,
  isAllowedWhileImpersonating,
} from "@/domain/impersonation";
import {
  defaultLocale,
  isLocale,
  localeCookieName,
} from "@/lib/localization/locale";
import { translate } from "@/lib/localization/messages";
import { rejectInvalidAppCheck } from "@/server/security/app-check";

export async function proxy(request: NextRequest) {
  if (
    request.method === "GET" &&
    (request.nextUrl.pathname === "/api/account/avatar" ||
      /^\/api\/users\/[^/]+\/avatar$/.test(request.nextUrl.pathname))
  )
    return NextResponse.next();
  // Cloud Scheduler has no App Check token; the route checks its own secret.
  if (
    request.method === "POST" &&
    (request.nextUrl.pathname === "/api/cron/reminders" ||
      request.nextUrl.pathname === "/api/cron/incoming-emails" ||
      request.nextUrl.pathname === "/api/cron/vacation-renewal")
  )
    return NextResponse.next();
  // The one place every change passes through, so a new route can't miss it.
  if (
    request.cookies.has(IMPERSONATION_COOKIE) &&
    !isAllowedWhileImpersonating(request.method, request.nextUrl.pathname)
  ) {
    const locale = request.cookies.get(localeCookieName)?.value;
    return NextResponse.json(
      {
        error: translate(
          isLocale(locale) ? locale : defaultLocale,
          "viewAsReadOnly",
        ),
      },
      { status: 403 },
    );
  }
  const rejection = await rejectInvalidAppCheck(request);
  return rejection ?? NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
