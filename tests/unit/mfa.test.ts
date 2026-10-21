import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasSecondFactor, isMfaRequired } from "@/server/auth/mfa";

const local = {
  PORTAL_ENVIRONMENT: "local",
  PORTAL_EXPECTED_PROJECT_ID: "debageri-portal-local",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "debageri-portal-local",
  FIREBASE_ADMIN_PROJECT_ID: "debageri-portal-local",
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true",
};

describe("MFA helpers", () => {
  it("is off unless explicitly enabled", () => {
    expect(isMfaRequired(local)).toBe(false);
    expect(isMfaRequired({ ...local, AUTH_REQUIRE_MFA: "true" })).toBe(true);
  });
  it("rejects invalid flag values", () =>
    expect(() =>
      isMfaRequired({ ...local, AUTH_REQUIRE_MFA: "yes" }),
    ).toThrow());
  it("detects a second-factor sign-in", () => {
    expect(
      hasSecondFactor({ firebase: { sign_in_second_factor: "totp" } }),
    ).toBe(true);
    expect(hasSecondFactor({ firebase: {} })).toBe(false);
    expect(hasSecondFactor({})).toBe(false);
  });
});

const state = vi.hoisted(() => ({
  decoded: {
    uid: "user-1",
    firebase: {} as { sign_in_second_factor?: string },
  },
  enrolledFactors: [] as unknown[],
  createSessionCookie: vi.fn(async () => "session-cookie"),
}));
vi.mock("@/lib/firebase/admin", () => ({
  getAdminServices: () => ({
    auth: {
      verifyIdToken: async () => state.decoded,
      getUser: async () => ({
        multiFactor: { enrolledFactors: state.enrolledFactors },
      }),
      createSessionCookie: state.createSessionCookie,
    },
    db: {
      collection: () => ({
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({ status: "active", role: "consultant" }),
          }),
        }),
      }),
    },
  }),
}));
vi.mock("@/server/auth/session", () => ({
  SESSION_COOKIE: "__session",
  SESSION_DURATION_MS: 1_000,
}));

import { POST } from "@/app/api/auth/session/route";

function signIn() {
  return POST(
    new Request("http://localhost/api/auth/session", {
      method: "POST",
      body: JSON.stringify({ idToken: "token" }),
    }),
  );
}

describe("session creation with mandatory MFA", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_REQUIRE_MFA", "true");
    state.decoded.firebase = {};
    state.enrolledFactors = [];
    state.createSessionCookie.mockClear();
  });

  it("asks users without a factor to enroll", async () => {
    const response = await signIn();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "mfaEnrollmentRequired" });
    expect(state.createSessionCookie).not.toHaveBeenCalled();
  });

  it("refuses password-only tokens for enrolled users", async () => {
    state.enrolledFactors = [{ factorId: "totp" }];
    const response = await signIn();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "mfaRequired" });
    expect(state.createSessionCookie).not.toHaveBeenCalled();
  });

  it("issues a session after a second-factor sign-in", async () => {
    state.decoded.firebase = { sign_in_second_factor: "totp" };
    const response = await signIn();
    expect(response.status).toBe(200);
    expect(state.createSessionCookie).toHaveBeenCalled();
  });

  it("keeps password-only sign-in when MFA is not required", async () => {
    vi.stubEnv("AUTH_REQUIRE_MFA", "false");
    const response = await signIn();
    expect(response.status).toBe(200);
  });
});
