import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  listNotifications,
  markNotificationsRead,
} from "@/server/services/notification-service";

const markReadSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(z.string().min(1).max(128)).min(1).max(100) }),
]);

export async function GET() {
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { db } = getAdminServices();
  const notifications = await listNotifications(
    db,
    actor.organizationId,
    actor.id,
  );
  return NextResponse.json(
    {
      notifications,
      unread: notifications.filter((item) => !item.read).length,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const actor = await verifySession();
  if (!actor)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = markReadSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  const { db } = getAdminServices();
  await markNotificationsRead(
    db,
    actor.organizationId,
    actor.id,
    "all" in parsed.data ? "all" : parsed.data.ids,
  );
  return NextResponse.json({ ok: true });
}
