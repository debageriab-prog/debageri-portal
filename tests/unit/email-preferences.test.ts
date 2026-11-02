import { describe, expect, it } from "vitest";
import { legacyPermissions } from "@/domain/access/permissions";
import {
  emailPreferencesFrom,
  relevantEmailTopics,
} from "@/domain/notifications";
import { emailPreferencesSchema } from "@/server/validators/user-access";

const access = (payslips: boolean, receipts: boolean) => ({
  payslips,
  receipts,
});

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
        permissions: legacyPermissions(
          "accountant",
          null,
          access(false, false),
        ),
      }),
    ).toEqual(["receipts"]);
    expect(
      relevantEmailTopics({
        reportsTime: true,
        permissions: legacyPermissions("consultant", null, access(true, true)),
      }),
    ).toEqual(["receipts", "payslips", "timesheets"]);
    expect(
      relevantEmailTopics({
        reportsTime: false,
        permissions: legacyPermissions("manager", null, access(false, false)),
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
