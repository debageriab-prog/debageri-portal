import { describe, expect, it } from "vitest";
import { validatePortalEnvironment } from "@/lib/config/environment";

const safe = {
  PORTAL_ENVIRONMENT: "local",
  PORTAL_EXPECTED_PROJECT_ID: "debageri-portal-dev",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "debageri-portal-dev",
  FIREBASE_ADMIN_PROJECT_ID: "debageri-portal-dev",
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true",
};
describe("environment isolation", () => {
  it("accepts an isolated portal project", () =>
    expect(validatePortalEnvironment(safe).useEmulators).toBe(true));
  it("refuses website projects", () =>
    expect(() =>
      validatePortalEnvironment({
        ...safe,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "debageri-web-prod",
        PORTAL_EXPECTED_PROJECT_ID: "debageri-web-prod",
        FIREBASE_ADMIN_PROJECT_ID: "debageri-web-prod",
      }),
    ).toThrow(/public website/));
  it("refuses mismatched projects", () =>
    expect(() =>
      validatePortalEnvironment({
        ...safe,
        FIREBASE_ADMIN_PROJECT_ID: "other-portal-dev",
      }),
    ).toThrow(/do not match/));
  it("refuses production locally", () =>
    expect(() =>
      validatePortalEnvironment({
        ...safe,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "debageri-portal-prod",
        PORTAL_EXPECTED_PROJECT_ID: "debageri-portal-prod",
        FIREBASE_ADMIN_PROJECT_ID: "debageri-portal-prod",
      }),
    ).toThrow(/Local/));
});
