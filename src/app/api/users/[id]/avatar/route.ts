import { getAdminServices } from "@/lib/firebase/admin";
import { reachesUser, reachOf } from "@/server/auth/reach";
import { verifySession } from "@/server/auth/session";

function objectPath(organizationId: string, userId: string) {
  return `organizations/${organizationId}/employees/${userId}/profile/avatar`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await verifySession();
  if (!actor)
    return Response.json({ error: "Unauthenticated" }, { status: 401 });

  const { id } = await params;
  const services = getAdminServices();
  const userDoc = await services.db.collection("users").doc(id).get();
  if (!userDoc.exists) return new Response(null, { status: 404 });
  const user = userDoc.data()!;
  const role = String(user.role);
  // Staff see their own picture and those of the people their groups reach.
  const visible =
    ["admin", "manager", "accountant"].includes(actor.role) &&
    user.organizationId === actor.organizationId &&
    (id === actor.id ||
      ((["employee", "consultant"].includes(role) ||
        (actor.role === "admin" &&
          ["manager", "accountant"].includes(role) &&
          user.reportsTime === true)) &&
        reachesUser(await reachOf(services.db, actor), id)));
  if (!visible) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const file = services.storage
      .bucket()
      .file(objectPath(actor.organizationId, id));
    const [metadata] = await file.getMetadata();
    const [contents] = await file.download();
    return new Response(new Uint8Array(contents), {
      headers: {
        "Cache-Control": "private, no-cache",
        "Content-Type": metadata.contentType ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (reason) {
    const code =
      typeof reason === "object" && reason && "code" in reason
        ? Number(reason.code)
        : 0;
    if (code === 404) return new Response(null, { status: 404 });
    return Response.json(
      { error: "The avatar could not be loaded." },
      { status: 500 },
    );
  }
}
