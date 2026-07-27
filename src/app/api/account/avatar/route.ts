import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maximumBytes = 2 * 1024 * 1024;

function objectPath(organizationId: string, userId: string) {
  return `organizations/${organizationId}/employees/${userId}/profile/avatar`;
}

export async function GET() {
  const user = await verifySession();
  if (!user)
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  try {
    const file = getAdminServices()
      .storage.bucket()
      .file(objectPath(user.organizationId, user.id));
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

export async function PUT(request: Request) {
  const user = await verifySession();
  if (!user)
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  const form = await request.formData();
  const image = form.get("avatar");
  if (!(image instanceof File))
    return Response.json(
      { error: "Choose an image to upload." },
      { status: 400 },
    );
  if (!allowedTypes.has(image.type))
    return Response.json(
      { error: "Use a JPEG, PNG or WebP image." },
      { status: 400 },
    );
  if (image.size > maximumBytes)
    return Response.json(
      { error: "The image must be 2 MB or smaller." },
      { status: 400 },
    );
  try {
    await getAdminServices()
      .storage.bucket()
      .file(objectPath(user.organizationId, user.id))
      .save(Buffer.from(await image.arrayBuffer()), {
        resumable: false,
        metadata: {
          contentType: image.type,
          cacheControl: "private, no-cache",
        },
      });
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "The avatar could not be updated. Try again." },
      { status: 500 },
    );
  }
}
