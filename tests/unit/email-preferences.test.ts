import { describe, expect, it } from "vitest";
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
        role: "accountant",
        reportsTime: false,
        documentAccess: access(false, false),
      }),
    ).toEqual(["receipts"]);
    expect(
      relevantEmailTopics({
        role: "consultant",
        reportsTime: true,
        documentAccess: access(true, true),
      }),
    ).toEqual(["receipts", "payslips", "timesheets"]);
    expect(
      relevantEmailTopics({
        role: "manager",
        reportsTime: false,
        documentAccess: access(false, false),
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
