import { describe, expect, it } from "vitest";
import {
  canReportTime,
  financeHome,
  homePath,
  PERMISSION_KEYS,
  permissionTreeFor,
  togglePermission,
  type PermissionKey,
} from "@/domain/access/permissions";
import en from "@/locales/en.json";
import sv from "@/locales/sv.json";
import { accessProfileSchema } from "@/server/validators/access-profile";
import { rolePermissions } from "./role-permissions";

const input = {
  name: "Finance read-only",
  description: "",
  audience: "staff",
  permissions: ["finance.ledger.view"],
};

describe("access profile validation", () => {
  it("accepts a staff profile", () => {
    expect(accessProfileSchema.safeParse(input).success).toBe(true);
  });

  it("rejects organization-wide keys on a consultant profile", () => {
    expect(
      accessProfileSchema.safeParse({ ...input, audience: "consultant" })
        .success,
    ).toBe(false);
  });

  it("rejects consultant-only keys on a staff profile", () => {
    expect(
      accessProfileSchema.safeParse({ ...input, permissions: ["my.finance"] })
        .success,
    ).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(
      accessProfileSchema.safeParse({ ...input, permissions: ["admin.all"] })
        .success,
    ).toBe(false);
  });
});

describe("togglePermission", () => {
  it("ticks the parent with a child", () => {
    expect(
      togglePermission([], "finance.ledger.export", true, "staff"),
    ).toEqual(["finance.ledger.view", "finance.ledger.export"]);
  });

  it("clears children with their parent", () => {
    expect(
      togglePermission(
        [
          "finance.ledger.view",
          "finance.ledger.edit",
          "finance.ledger.export",
          "finance.vat.view",
        ],
        "finance.ledger.view",
        false,
        "staff",
      ),
    ).toEqual(["finance.vat.view"]);
  });

  it("keeps the parent when only a child is cleared", () => {
    expect(
      togglePermission(
        ["finance.ledger.view", "finance.ledger.edit"],
        "finance.ledger.edit",
        false,
        "staff",
      ),
    ).toEqual(["finance.ledger.view"]);
  });
});

describe("permissionTreeFor", () => {
  it("gives consultants the portal's menu with their own pages", () => {
    const tree = permissionTreeFor("consultant");
    expect(tree.map((group) => group.id)).toEqual([
      "time",
      "finance",
      "documents",
      "receipts",
    ]);
    expect(tree[0]!.nodes).toEqual([
      { key: "my.time.report" },
      { key: "my.time.history", children: [{ key: "my.time.income" }] },
    ]);
  });

  it("keeps consultant-only rows out of the office staff tree", () => {
    const keys = permissionTreeFor("staff").flatMap((group) =>
      group.nodes.map((node) => node.key),
    );
    expect(keys).toContain("my.payslips");
    expect(keys).toContain("my.receipts");
    expect(keys).not.toContain("my.finance");
    expect(keys).not.toContain("my.contracts");
  });
});

describe("own time reporting", () => {
  const history: PermissionKey[] = ["my.time.history"];

  it("needs both the profile and being expected to report", () => {
    expect(
      canReportTime({ reportsTime: true, permissions: ["my.time.report"] }),
    ).toBe(true);
    expect(canReportTime({ reportsTime: true, permissions: history })).toBe(
      false,
    );
    expect(
      canReportTime({ reportsTime: false, permissions: ["my.time.report"] }),
    ).toBe(false);
  });

  it("sends a history-only person to History", () => {
    expect(homePath({ reportsTime: true, permissions: history })).toBe(
      "/employee/timesheets",
    );
    expect(homePath({ reportsTime: false, permissions: history })).toBe(
      "/unauthorized",
    );
  });
});

describe("landing pages", () => {
  const home = (permissions: PermissionKey[], reportsTime = false) =>
    homePath({ permissions, reportsTime });

  it("keeps each role where it landed before profiles", () => {
    expect(home(rolePermissions("admin"))).toBe("/manager/approvals");
    expect(home(rolePermissions("manager"))).toBe("/manager/approvals");
    expect(home(rolePermissions("accountant"))).toBe("/time-reports");
    expect(home(rolePermissions("consultant"), true)).toBe(
      "/employee/timesheets/current",
    );
  });

  it("sends a finance-only profile to the first page it can open", () => {
    expect(home(["finance.vat.view"])).toBe("/finance/vat-settlements");
    expect(financeHome({ permissions: ["finance.invoices.view"] })).toBe(
      "/finance?section=invoices",
    );
  });

  it("falls back to the unauthorized page with nothing granted", () => {
    expect(home([])).toBe("/unauthorized");
  });
});

describe("permission labels", () => {
  const keys = (messages: object) => new Set(Object.keys(messages));

  it.each([
    ["en", en],
    ["sv", sv],
  ])("names every permission and group in %s", (_name, messages) => {
    const known = keys(messages);
    for (const key of PERMISSION_KEYS)
      expect(known.has(`permission_${key.replaceAll(".", "_")}`)).toBe(true);
    for (const group of ["time", "finance", "documents", "receipts"])
      expect(known.has(`permissionGroup_${group}`)).toBe(true);
  });
});
