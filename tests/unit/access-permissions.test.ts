import { describe, expect, it } from "vitest";
import {
  audienceForRole,
  can,
  DEFAULT_PROFILES,
  legacyPermissions,
  normalizePermissions,
  PERMISSION_KEYS,
  PERMISSION_TREE,
  permissionsForAudience,
  resolvePermissions,
  type PermissionKey,
  type PermissionNode,
} from "@/domain/access/permissions";

const noFlags = {
  finance: { enabled: false, myFinance: false, myInvoices: false },
  documents: { contracts: false, payslips: false, receipts: false },
};
const allFlags = {
  finance: { enabled: true, myFinance: true, myInvoices: true },
  documents: { contracts: true, payslips: true, receipts: true },
};
const orgWide = (role: string) =>
  legacyPermissions(role, noFlags.finance, noFlags.documents);

/** What each role could do before profiles, row by row. */
const matrix: Array<[PermissionKey, manager: boolean, accountant: boolean]> = [
  ["finance.ledger.view", false, true],
  ["finance.ledger.edit", false, true],
  ["finance.ledger.import", false, true],
  ["finance.ledger.export", false, true],
  ["finance.invoices.view", false, true],
  ["finance.invoices.edit", false, true],
  ["finance.invoices.import", false, true],
  ["finance.customers.view", false, true],
  ["finance.customers.edit", false, true],
  ["finance.vat.view", false, true],
  ["finance.vat.edit", false, true],
  ["finance.accountingEmail", false, true],
  ["finance.aiExtraction", false, true],
  ["finance.categories.view", false, true],
  ["finance.categories.edit", false, false],
  ["finance.compensation.view", false, true],
  ["finance.compensation.edit", false, false],
  ["time.reports.view", true, true],
  ["time.reports.viewIncome", true, true],
  ["time.approvals.review", true, false],
  ["time.reminders.view", true, true],
  ["time.reminders.send", true, true],
  ["time.reminders.schedule", true, true],
  ["documents.contracts.view", true, true],
  ["documents.contracts.edit", true, false],
  ["documents.payslips.view", false, true],
  ["documents.payslips.edit", false, true],
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
    expect(permissionsForAudience("consultant")).toEqual([
      "my.finance",
      "my.invoices",
      "my.contracts",
      "my.payslips",
      "my.receipts",
    ]);
  });

  it("keeps consultant-only records away from staff", () => {
    const staff = permissionsForAudience("staff");
    expect(staff).toContain("my.payslips");
    expect(staff).not.toContain("my.finance");
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
      normalizePermissions(
        ["finance.compensation.edit", "my.payslips"],
        "consultant",
      ),
    ).toEqual(["my.payslips"]);
  });
});

describe("legacy behaviour", () => {
  it.each(matrix)("%s matches the old roles", (key, manager, accountant) => {
    expect(orgWide("manager").includes(key)).toBe(manager);
    expect(orgWide("accountant").includes(key)).toBe(accountant);
  });

  it("covers every organization-wide permission in the matrix", () => {
    expect(matrix.map(([key]) => key).sort()).toEqual(
      PERMISSION_KEYS.filter((key) => !key.startsWith("my.")).sort(),
    );
  });

  it("gives admins everything", () => {
    expect(orgWide("admin")).toEqual([...PERMISSION_KEYS]);
  });

  it("gives a consultant only what their flags allow", () => {
    expect(orgWide("consultant")).toEqual([]);
    expect(
      legacyPermissions("consultant", allFlags.finance, allFlags.documents),
    ).toEqual(permissionsForAudience("consultant"));
  });

  it("ignores finance page flags when finance is not enabled", () => {
    expect(
      legacyPermissions(
        "consultant",
        { enabled: false, myFinance: true, myInvoices: true },
        noFlags.documents,
      ),
    ).toEqual([]);
  });

  it("keeps a manager's own pay slip and receipt flags", () => {
    const keys = legacyPermissions("manager", noFlags.finance, {
      contracts: true,
      payslips: true,
      receipts: true,
    });
    expect(keys).toContain("my.payslips");
    expect(keys).toContain("my.receipts");
    expect(keys).not.toContain("my.contracts");
  });

  it("never lets accountants hold own-document flags", () => {
    expect(
      legacyPermissions("accountant", allFlags.finance, allFlags.documents),
    ).toEqual(orgWide("accountant"));
  });

  it("treats a legacy employee as document-only", () => {
    expect(
      legacyPermissions("employee", allFlags.finance, allFlags.documents),
    ).toEqual(["my.payslips", "my.receipts"]);
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

  it.each(["manager", "accountant"] as const)(
    "%s matches the old role",
    (role) => {
      const profile = DEFAULT_PROFILES.find(
        (candidate) => candidate.defaultForRole === role,
      )!;
      expect([...profile.permissions].sort()).toEqual(
        [...orgWide(role)].sort(),
      );
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

  it("falls back to flags without a profile", () => {
    expect(
      resolvePermissions(
        { role: "manager", organizationId: "org", accessProfileId: null },
        null,
      ),
    ).toEqual(orgWide("manager"));
  });

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
    expect(resolvePermissions({ ...manager, role: "admin" }, profile)).toEqual([
      ...PERMISSION_KEYS,
    ]);
  });
});
