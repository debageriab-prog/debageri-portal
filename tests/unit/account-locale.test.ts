import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  actor: null as { id: string; organizationId: string } | null,
  update: vi.fn(),
  create: vi.fn(),
  commit: vi.fn(async () => undefined),
}));
vi.mock("@/server/auth/session", () => ({
  verifySession: async () => state.actor,
}));
vi.mock("@/lib/firebase/admin", () => ({
  getAdminServices: () => ({
    db: {
      batch: () => ({
        update: state.update,
        create: state.create,
        commit: state.commit,
      }),
      collection: (name: string) => ({
        doc: (id = "generated") => ({ path: `${name}/${id}` }),
      }),
    },
  }),
}));

import { PUT } from "@/app/api/account/locale/route";

function put(body: unknown) {
  return PUT(
    new Request("http://localhost/api/account/locale", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  );
}

describe("PUT /api/account/locale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.actor = { id: "user-1", organizationId: "debageri" };
  });

  it("requires a signed-in person", async () => {
    state.actor = null;
    expect((await put({ locale: "en-SE" })).status).toBe(401);
    expect(state.commit).not.toHaveBeenCalled();
  });

  it("rejects unsupported languages", async () => {
    const response = await put({ locale: "en-US" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalidInput" });
    expect(state.commit).not.toHaveBeenCalled();
  });

  it("stores the language on the person's own user and audits it", async () => {
    expect((await put({ locale: "sv-SE" })).status).toBe(200);
    expect(state.update).toHaveBeenCalledWith(
      { path: "users/user-1" },
      expect.objectContaining({ locale: "sv-SE" }),
    );
    expect(state.create).toHaveBeenCalledWith(
      { path: "auditLogs/generated" },
      expect.objectContaining({
        action: "user.localeUpdated",
        entityId: "user-1",
        metadata: { locale: "sv-SE" },
      }),
    );
    expect(state.commit).toHaveBeenCalledOnce();
  });
});
