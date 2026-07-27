import { getAdminServices } from "@/lib/firebase/admin";
import { validatePortalEnvironment } from "@/lib/config/environment";

export async function rejectInvalidAppCheck(
  request: Request,
): Promise<Response | null> {
  if (validatePortalEnvironment().environment !== "production") return null;

  const token = request.headers.get("X-Firebase-AppCheck");
  if (!token) {
    return Response.json(
      {
        error:
          "The security check could not be completed. Refresh and try again.",
      },
      { status: 401 },
    );
  }

  try {
    await getAdminServices().appCheck.verifyToken(token);
    return null;
  } catch {
    return Response.json(
      {
        error:
          "The security check expired or was invalid. Refresh and try again.",
      },
      { status: 401 },
    );
  }
}
