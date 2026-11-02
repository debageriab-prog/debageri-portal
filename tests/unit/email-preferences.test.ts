import { describe, expect, it } from "vitest";
import {
  emailPreferencesFrom,
  relevantEmailTopics,
} from "@/domain/notifications";
import { emailPreferencesSchema } from "@/server/validators/user-access";
import { rolePermissions } from "./role-permissions";

describe("email preferences", () => {
  it("sends every email type until the person turns it off", () => {
    expect(emailPreferencesFrom(undefined)).toEqual({
      receipts: true,
      payslips: true,
      timesheets: true,
    });
    expect(emailPreferencesFrom({ receipts: false }).receipts).toBe(false);
  });

  it("only offers the email types that can reach the person", () => {
    expect(
      relevantEmailTopics({
        reportsTime: false,
        permissions: rolePermissions("accountant"),
      }),
    ).toEqual(["receipts"]);
    expect(
      relevantEmailTopics({
        reportsTime: true,
        permissions: rolePermissions("consultant"),
      }),
    ).toEqual(["receipts", "payslips", "timesheets"]);
    expect(
      relevantEmailTopics({
        reportsTime: false,
        permissions: rolePermissions("manager"),
      }),
    ).toEqual([]);
  });

  it("requires a choice for every type and nothing for reminders", () => {
    expect(
      emailPreferencesSchema.safeParse({
        receipts: false,
        payslips: true,
        timesheets: true,
      }).success,
    ).toBe(true);
    expect(emailPreferencesSchema.safeParse({ receipts: false }).success).toBe(
      false,
    );
    const parsed = emailPreferencesSchema.parse({
      receipts: true,
      payslips: true,
      timesheets: true,
      reminders: false,
    });
    expect(parsed).not.toHaveProperty("reminders");
  });
});
