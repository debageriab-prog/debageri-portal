import { describe, expect, it } from "vitest";
import {
  canImpersonate,
  isAllowedWhileImpersonating,
} from "@/domain/impersonation";

const admin = { id: "admin", organizationId: "org", role: "admin" };
const target = { id: "person", organizationId: "org", status: "active" };

describe("canImpersonate", () => {
  it("lets an admin view an active colleague", () =>
    expect(canImpersonate(admin, target)).toBe(true));
  it.each(["consultant", "manager", "accountant"])(
    "refuses a %s, whatever access they hold",
    (role) => expect(canImpersonate({ ...admin, role }, target)).toBe(false),
  );
  it("refuses viewing oneself", () =>
    expect(canImpersonate(admin, { ...target, id: admin.id })).toBe(false));
  it("refuses another organization", () =>
    expect(canImpersonate(admin, { ...target, organizationId: "other" })).toBe(
      false,
    ));
  it("refuses someone who is not active", () =>
    expect(canImpersonate(admin, { ...target, status: "inactive" })).toBe(
      false,
    ));
});

describe("isAllowedWhileImpersonating", () => {
  it.each(["GET", "HEAD", "OPTIONS"])("allows reading with %s", (method) =>
    expect(isAllowedWhileImpersonating(method, "/api/finance")).toBe(true),
  );
  it.each([
    ["POST", "/api/finance"],
    ["PUT", "/api/timesheets/current"],
    ["PATCH", "/api/admin/users/person"],
    ["DELETE", "/api/receipts/one"],
    ["PUT", "/api/account/locale"],
    ["POST", "/api/notifications"],
  ])("blocks %s %s", (method, pathname) =>
    expect(isAllowedWhileImpersonating(method, pathname)).toBe(false),
  );
  it("blocks starting another view", () =>
    expect(
      isAllowedWhileImpersonating("POST", "/api/admin/impersonation"),
    ).toBe(false));
  it("allows leaving the view and the session", () => {
    expect(
      isAllowedWhileImpersonating("DELETE", "/api/admin/impersonation"),
    ).toBe(true);
    expect(isAllowedWhileImpersonating("DELETE", "/api/auth/session")).toBe(
      true,
    );
    expect(isAllowedWhileImpersonating("POST", "/api/auth/session")).toBe(true);
  });
});
