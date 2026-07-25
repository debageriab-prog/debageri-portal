import { z } from "zod";

const forbiddenProjectPattern = /^debageri-web(?:-|$)/i;

export interface PortalEnvironment {
  environment: "local" | "development" | "production" | "test";
  expectedProjectId: string;
  publicProjectId: string;
  adminProjectId: string;
  useEmulators: boolean;
}

export function validatePortalEnvironment(
  source: Record<string, string | undefined> = process.env,
): PortalEnvironment {
  const schema = z.object({
    PORTAL_ENVIRONMENT: z
      .enum(["local", "development", "production", "test"])
      .default("test"),
    PORTAL_EXPECTED_PROJECT_ID: z
      .string()
      .min(1)
      .default("debageri-portal-dev"),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: z
      .string()
      .min(1)
      .default("debageri-portal-dev"),
    FIREBASE_ADMIN_PROJECT_ID: z.string().min(1).default("debageri-portal-dev"),
    NEXT_PUBLIC_USE_FIREBASE_EMULATORS: z
      .enum(["true", "false"])
      .default("false"),
  });
  const parsed = schema.parse(source);
  const ids = [
    parsed.PORTAL_EXPECTED_PROJECT_ID,
    parsed.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    parsed.FIREBASE_ADMIN_PROJECT_ID,
  ];
  if (ids.some((id) => forbiddenProjectPattern.test(id))) {
    throw new Error("Refusing to use the public website Firebase project");
  }
  if (new Set(ids).size !== 1)
    throw new Error("Portal Firebase project IDs do not match");
  if (
    parsed.PORTAL_ENVIRONMENT === "production" &&
    !ids[0]?.includes("portal-prod")
  ) {
    throw new Error("Production must target a portal production project");
  }
  if (parsed.PORTAL_ENVIRONMENT === "local" && ids[0]?.includes("prod")) {
    throw new Error("Local development cannot target a production project");
  }
  return {
    environment: parsed.PORTAL_ENVIRONMENT,
    expectedProjectId: parsed.PORTAL_EXPECTED_PROJECT_ID,
    publicProjectId: parsed.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    adminProjectId: parsed.FIREBASE_ADMIN_PROJECT_ID,
    useEmulators: parsed.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true",
  };
}
