import { describe, expect, it } from "vitest";
import { validatePortalEnvironment } from "@/lib/config/environment";

const safe = {
  PORTAL_ENVIRONMENT: "local",
  PORTAL_EXPECTED_PROJECT_ID: "debageri-portal-local",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "debageri-portal-local",
  FIREBASE_ADMIN_PROJECT_ID: "debageri-portal-local",
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
        FIREBASE_ADMIN_PROJECT_ID: "other-portal",
      }),
    ).toThrow(/do not match/));
  it("refuses the production project locally", () =>
    expect(() =>
      validatePortalEnvironment({
        ...safe,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "debageri-portal",
        PORTAL_EXPECTED_PROJECT_ID: "debageri-portal",
        FIREBASE_ADMIN_PROJECT_ID: "debageri-portal",
      }),
    ).toThrow(/Local/));
  it("accepts the single production project without emulators", () =>
    expect(
      validatePortalEnvironment({
        PORTAL_ENVIRONMENT: "production",
        PORTAL_EXPECTED_PROJECT_ID: "debageri-portal",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "debageri-portal",
        FIREBASE_ADMIN_PROJECT_ID: "debageri-portal",
        NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "false",
      }),
    ).toMatchObject({
      environment: "production",
      expectedProjectId: "debageri-portal",
      useEmulators: false,
    }));
  it("accepts the isolated development project without emulators", () =>
    expect(
      validatePortalEnvironment({
        PORTAL_ENVIRONMENT: "development",
        PORTAL_EXPECTED_PROJECT_ID: "debageri-portal-dev",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "debageri-portal-dev",
        FIREBASE_ADMIN_PROJECT_ID: "debageri-portal-dev",
        NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "false",
      }),
    ).toMatchObject({
      environment: "development",
      expectedProjectId: "debageri-portal-dev",
      useEmulators: false,
    }));
  it("refuses production from a development deployment", () =>
    expect(() =>
      validatePortalEnvironment({
        PORTAL_ENVIRONMENT: "development",
        PORTAL_EXPECTED_PROJECT_ID: "debageri-portal",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "debageri-portal",
        FIREBASE_ADMIN_PROJECT_ID: "debageri-portal",
        NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "false",
      }),
    ).toThrow(/Development/));
  it("refuses development from a production deployment", () =>
    expect(() =>
      validatePortalEnvironment({
        PORTAL_ENVIRONMENT: "production",
        PORTAL_EXPECTED_PROJECT_ID: "debageri-portal-dev",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "debageri-portal-dev",
        FIREBASE_ADMIN_PROJECT_ID: "debageri-portal-dev",
        NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "false",
      }),
    ).toThrow(/Production/));
  it("refuses cloud projects from test mode", () =>
    expect(() =>
      validatePortalEnvironment({
        PORTAL_ENVIRONMENT: "test",
        PORTAL_EXPECTED_PROJECT_ID: "debageri-portal-dev",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "debageri-portal-dev",
        FIREBASE_ADMIN_PROJECT_ID: "debageri-portal-dev",
        NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "false",
      }),
    ).toThrow(/Tests/));
});
