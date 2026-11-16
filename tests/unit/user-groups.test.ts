import { describe, expect, it } from "vitest";
import {
  COMPANY_GROUP_ID,
  membershipIds,
  reachFrom,
  reachesCompany,
  reachesRecord,
  reachesUser,
  scopeFromProfile,
} from "@/domain/access/groups";
import { resolveScope } from "@/domain/access/permissions";
import { accessProfileSchema } from "@/server/validators/access-profile";

const users = [
  { id: "it-1", groupIds: ["it"] },
  { id: "it-2", groupIds: ["it", "finance"] },
  { id: "fin-1", groupIds: ["finance"] },
  { id: "boss", groupIds: ["business"] },
  { id: "loose" },
];
const active = new Set(["it", "finance", "business"]);

describe("employee group reach", () => {
  it("reaches only members of the managed groups", () => {
    const reach = reachFrom(
      { scope: "groups", groupIds: ["it"] },
      active,
      users,
    );
    expect(reachesUser(reach, "it-1")).toBe(true);
    expect(reachesUser(reach, "it-2")).toBe(true);
    expect(reachesUser(reach, "fin-1")).toBe(false);
    expect(reachesUser(reach, "loose")).toBe(false);
    expect(reachesCompany(reach)).toBe(false);
  });

  it("lets a higher level manage managers through their group", () => {
    const reach = reachFrom(
      { scope: "groups", groupIds: ["business"] },
      active,
      users,
    );
    expect(reachesUser(reach, "boss")).toBe(true);
    expect(reachesUser(reach, "it-1")).toBe(false);
  });

  it("needs the company group for records without an employee", () => {
    const without = reachFrom(
      { scope: "groups", groupIds: ["it"] },
      active,
      users,
    );
    const withCompany = reachFrom(
      { scope: "groups", groupIds: ["it", COMPANY_GROUP_ID] },
      active,
      users,
    );
    expect(reachesRecord(without, null)).toBe(false);
    expect(reachesRecord(withCompany, null)).toBe(true);
    expect(reachesRecord(withCompany, "fin-1")).toBe(false);
  });

  it("ignores disabled groups on both sides", () => {
    const reach = reachFrom(
      { scope: "groups", groupIds: ["it"] },
      new Set(["finance"]),
      users,
    );
    expect(reachesUser(reach, "it-1")).toBe(false);
  });

  it("reaches everyone and company data with the all scope", () => {
    const reach = reachFrom({ scope: "all", groupIds: [] }, active, users);
    expect(reachesUser(reach, "loose")).toBe(true);
    expect(reachesRecord(reach, null)).toBe(true);
  });

  it("reaches nobody with no group ticked", () => {
    const reach = reachFrom({ scope: "groups", groupIds: [] }, active, users);
    expect(users.some((user) => reachesUser(reach, user.id))).toBe(false);
    expect(reachesUser(reach, null)).toBe(false);
  });

  it("never counts the company group as a membership", () => {
    expect(membershipIds(["it", COMPANY_GROUP_ID, "it", 4, ""])).toEqual([
      "it",
    ]);
  });
});

describe("profile scope", () => {
  const user = {
    role: "manager",
    organizationId: "org",
    accessProfileId: "p1",
  };
  const profile = {
    organizationId: "org",
    audience: "staff" as const,
    permissions: ["time.reports.view"],
  };

  it("treats profiles saved before groups as managing everyone", () => {
    expect(scopeFromProfile({})).toEqual({ scope: "all", groupIds: [] });
    expect(resolveScope(user, profile)).toEqual({ scope: "all", groupIds: [] });
  });

  it("keeps the chosen groups of a staff profile", () => {
    expect(
      resolveScope(user, { ...profile, scope: "groups", groupIds: ["it"] }),
    ).toEqual({ scope: "groups", groupIds: ["it"] });
  });

  it("gives admins everything and broken profiles nothing", () => {
    expect(resolveScope({ ...user, role: "admin" }, null).scope).toBe("all");
    expect(resolveScope(user, null)).toEqual({ scope: "groups", groupIds: [] });
    expect(resolveScope(user, { ...profile, organizationId: "other" })).toEqual(
      { scope: "groups", groupIds: [] },
    );
  });

  it("gives consultant profiles no reach over others", () => {
    expect(
      resolveScope(
        { ...user, role: "consultant" },
        { ...profile, audience: "consultant" },
      ),
    ).toEqual({ scope: "groups", groupIds: [] });
  });

  it("defaults old profile input to all employees", () => {
    const parsed = accessProfileSchema.parse({
      name: "Manager",
      description: "",
      audience: "staff",
      permissions: [],
    });
    expect(parsed.scope).toBe("all");
    expect(parsed.groupIds).toEqual([]);
  });
});
