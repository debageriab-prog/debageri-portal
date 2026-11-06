import { describe, expect, it } from "vitest";
import {
  audienceForRole,
  can,
  DEFAULT_PROFILES,
  normalizePermissions,
  PERMISSION_KEYS,
  PERMISSION_TREE,
  permissionsForAudience,
  resolvePermissions,
  type PermissionKey,
  type PermissionNode,
} from "@/domain/access/permissions";
import { rolePermissions } from "./role-permissions";

/** What each role could do before profiles, row by row. */
const matrix: Array<[PermissionKey, manager: boolean, accountant: boolean]> = [
  ["finance.ledger.view", false, true],
  ["finance.ledger.add", false, true],
  ["finance.ledger.edit", false, true],
  ["finance.ledger.delete", false, true],
  ["finance.ledger.import", false, true],
  ["finance.ledger.export", false, true],
  ["finance.overview.export", false, true],
  ["finance.invoices.view", false, true],
  ["finance.invoices.add", false, true],
  ["finance.invoices.edit", false, true],
  ["finance.invoices.delete", false, true],
  ["finance.invoices.import", false, true],
  ["finance.invoices.send", false, true],
  ["finance.customers.view", false, true],
  ["finance.customers.add", false, true],
  ["finance.customers.edit", false, true],
  ["finance.vat.view", false, true],
  ["finance.vat.add", false, true],
  ["finance.vat.edit", false, true],
  ["finance.vat.delete", false, true],
  ["finance.incomingEmails.view", false, true],
  ["finance.incomingEmails.process", false, true],
  ["finance.accountingEmail", false, true],
  ["finance.aiExtraction", false, true],
  ["finance.categories.view", false, true],
  ["finance.categories.add", false, false],
  ["finance.categories.edit", false, false],
  ["time.reports.view", true, true],
  ["time.reports.viewIncome", true, true],
  ["time.reports.export", true, true],
  ["time.approvals.review", true, false],
  ["time.reminders.view", true, true],
  ["time.reminders.send", true, true],
  ["time.reminders.schedule", true, true],
  ["documents.contracts.view", true, true],
  ["documents.contracts.add", true, false],
  ["documents.contracts.edit", true, false],
  ["documents.contracts.delete", true, false],
  ["documents.payslips.view", false, true],
  ["documents.payslips.upload", false, true],
  ["documents.payslips.delete", false, true],
  ["documents.receipts.review", false, true],
  ["documents.receipts.book", false, true],
];

function keysIn(nodes: PermissionNode[]): PermissionKey[] {
  return nodes.flatMap((node) => [node.key, ...keysIn(node.children ?? [])]);
}

describe("permission catalogue", () => {
  it("places every key in the tree exactly once", () => {
    const keys = PERMISSION_TREE.flatMap((group) => keysIn(group.nodes));
    expect([...keys].sort()).toEqual([...PERMISSION_KEYS].sort());
  });

  it("limits consultants to their own data", () => {
    expect(
      permissionsForAudience("consultant").every((key) =>
        key.startsWith("my."),
      ),
    ).toBe(true);
    expect(permissionsForAudience("consultant")).toContain("my.time.income");
  });

  it("keeps consultant-only records away from staff", () => {
    const staff = permissionsForAudience("staff");
    expect(staff).toContain("my.payslips");
    expect(staff).not.toContain("my.finance");
    expect(staff).not.toContain("my.transactions");
    expect(staff).not.toContain("my.contracts");
  });

  it("maps roles to audiences and leaves admin out", () => {
    expect(audienceForRole("consultant")).toBe("consultant");
    expect(audienceForRole("employee")).toBe("consultant");
    expect(audienceForRole("manager")).toBe("staff");
    expect(audienceForRole("accountant")).toBe("staff");
    expect(audienceForRole("admin")).toBeNull();
  });
});

describe("normalizePermissions", () => {
  it("adds parents of a child", () => {
    expect(normalizePermissions(["finance.ledger.import"], "staff")).toEqual([
      "finance.ledger.view",
      "finance.ledger.import",
    ]);
  });

  it("drops unknown keys and duplicates", () => {
    expect(
      normalizePermissions(
        ["finance.vat.view", "finance.vat.view", "nonsense", 7],
        "staff",
      ),
    ).toEqual(["finance.vat.view"]);
  });

  it("strips organization-wide keys from consultant profiles", () => {
    expect(
      normalizePermissions(["finance.vat.edit", "my.payslips"], "consultant"),
    ).toEqual(["my.payslips"]);
  });
});

describe("default profiles match the roles", () => {
  it.each(matrix)("%s matches the old roles", (key, manager, accountant) => {
    expect(rolePermissions("manager").includes(key)).toBe(manager);
    expect(rolePermissions("accountant").includes(key)).toBe(accountant);
  });

  it("covers every organization-wide permission in the matrix", () => {
    expect(matrix.map(([key]) => key).sort()).toEqual(
      PERMISSION_KEYS.filter((key) => !key.startsWith("my.")).sort(),
    );
  });

  it("gives admins all company permissions and no own records", () => {
    expect(rolePermissions("admin")).toEqual(
      PERMISSION_KEYS.filter((key) => !key.startsWith("my.")),
    );
  });
});

describe("default profiles", () => {
  it.each(DEFAULT_PROFILES)(
    "$name is already normalized for its audience",
    (profile) => {
      expect(
        normalizePermissions(profile.permissions, profile.audience),
      ).toEqual([...profile.permissions]);
    },
  );
});

describe("resolvePermissions", () => {
  const profile = {
    organizationId: "org",
    audience: "staff" as const,
    permissions: ["finance.ledger.view"],
  };
  const manager = {
    role: "manager",
    organizationId: "org",
    accessProfileId: "p1",
  };

  it("uses the assigned profile instead of the role", () => {
    const permissions = resolvePermissions(manager, profile);
    expect(permissions).toEqual(["finance.ledger.view"]);
    expect(can({ permissions }, "time.approvals.review")).toBe(false);
  });

  it.each(["manager", "accountant", "consultant", "employee"])(
    "grants a %s nothing without a profile",
    (role) => {
      expect(
        resolvePermissions(
          { role, organizationId: "org", accessProfileId: null },
          profile,
        ),
      ).toEqual([]);
    },
  );

  it("grants nothing when the assigned profile is gone", () => {
    expect(resolvePermissions(manager, null)).toEqual([]);
  });

  it("grants nothing for another organization's profile", () => {
    expect(
      resolvePermissions(manager, { ...profile, organizationId: "other" }),
    ).toEqual([]);
  });

  it("grants nothing when the audience does not match the role", () => {
    expect(
      resolvePermissions(
        { ...manager, role: "consultant" },
        { ...profile, audience: "staff" },
      ),
    ).toEqual([]);
  });

  it("never reads organization-wide keys into a consultant profile", () => {
    expect(
      resolvePermissions(
        { ...manager, role: "consultant" },
        {
          organizationId: "org",
          audience: "consultant",
          permissions: ["finance.ledger.view", "my.invoices"],
        },
      ),
    ).toEqual(["my.invoices"]);
  });

  it("keeps admins on everything regardless of any profile", () => {
    expect(resolvePermissions({ ...manager, role: "admin" }, profile)).toEqual(
      rolePermissions("admin"),
    );
  });
});
