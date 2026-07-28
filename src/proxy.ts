import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { rejectInvalidAppCheck } from "@/server/security/app-check";

export async function proxy(request: NextRequest) {
  if (
    request.method === "GET" &&
    (request.nextUrl.pathname === "/api/account/avatar" ||
      /^\/api\/users\/[^/]+\/avatar$/.test(request.nextUrl.pathname))
  )
    return NextResponse.next();
  const rejection = await rejectInvalidAppCheck(request);
  return rejection ?? NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
