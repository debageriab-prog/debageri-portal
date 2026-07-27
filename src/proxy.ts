import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { rejectInvalidAppCheck } from "@/server/security/app-check";

export async function proxy(request: NextRequest) {
  const rejection = await rejectInvalidAppCheck(request);
  return rejection ?? NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
