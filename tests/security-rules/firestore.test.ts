import { afterAll, beforeAll, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";

let env: RulesTestEnvironment;
beforeAll(async () => {
  const [host = "127.0.0.1", port = "8180"] = (
    process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8180"
  ).split(":");
  env = await initializeTestEnvironment({
    projectId: "debageri-portal-rules",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host,
      port: Number(port),
    },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users/u1"), {
      organizationId: "debageri",
      status: "active",
      role: "employee",
      managerId: "m1",
    });
    await setDoc(doc(db, "users/u2"), {
      organizationId: "debageri",
      status: "active",
      role: "employee",
      managerId: "m2",
    });
    await setDoc(doc(db, "users/m1"), {
      organizationId: "debageri",
      status: "active",
      role: "manager",
      managerId: null,
    });
    await setDoc(doc(db, "users/m2"), {
      organizationId: "debageri",
      status: "active",
      role: "manager",
      managerId: null,
    });
    await setDoc(doc(db, "timesheets/s1"), {
      organizationId: "debageri",
      userId: "u1",
      managerId: "m1",
      status: "draft",
    });
    await setDoc(doc(db, "timesheets/s2"), {
      organizationId: "debageri",
      userId: "u2",
      managerId: "m2",
      status: "submitted",
    });
    await setDoc(doc(db, "financialTransactions/f1"), {
      organizationId: "debageri",
      consultantId: "u1",
      internalNote: "private",
    });
    await setDoc(doc(db, "vatSettlements/v1"), {
      organizationId: "debageri",
      amountMinor: 10_000,
      status: "active",
    });
  });
});
afterAll(async () => env.cleanup());
describe("Firestore rules", () => {
  it("prevents employee cross-user reads", async () => {
    const db = env.authenticatedContext("u1").firestore();
    await assertSucceeds(getDoc(doc(db, "timesheets/s1")));
    await assertFails(getDoc(doc(db, "timesheets/s2")));
  });
  it("gives managers no direct reads, since profiles decide on the server", async () => {
    const db = env.authenticatedContext("m1").firestore();
    await assertFails(getDoc(doc(db, "timesheets/s1")));
    await assertFails(getDoc(doc(db, "users/u1")));
  });
  it("keeps access profiles server-only, even from admins", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users/a1"), {
        organizationId: "debageri",
        status: "active",
        role: "admin",
      });
      await setDoc(doc(context.firestore(), "accessProfiles/p1"), {
        organizationId: "debageri",
        permissions: [],
      });
    });
    const admin = env.authenticatedContext("a1").firestore();
    await assertFails(getDoc(doc(admin, "accessProfiles/p1")));
    await assertFails(
      setDoc(doc(admin, "accessProfiles/p1"), {
        organizationId: "debageri",
        permissions: ["finance.ledger.view"],
      }),
    );
  });
  it("keeps vacation periods and adjustments server-only, even from admins", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "vacationPeriods/v1"), {
        organizationId: "debageri",
        userId: "e1",
      });
      await setDoc(doc(context.firestore(), "vacationAdjustments/a1"), {
        organizationId: "debageri",
        userId: "e1",
      });
    });
    for (const uid of ["a1", "e1"]) {
      const db = env.authenticatedContext(uid).firestore();
      await assertFails(getDoc(doc(db, "vacationPeriods/v1")));
      await assertFails(getDoc(doc(db, "vacationAdjustments/a1")));
      await assertFails(
        setDoc(doc(db, "vacationAdjustments/a2"), {
          organizationId: "debageri",
          userId: "e1",
          bucket: "normal",
          deltaMinutes: 4800,
        }),
      );
    }
  });
  it("prevents direct approval updates", async () => {
    const db = env.authenticatedContext("m1").firestore();
    await assertFails(
      setDoc(doc(db, "timesheets/s1"), {
        organizationId: "debageri",
        userId: "u1",
        managerId: "m1",
        status: "approved",
      }),
    );
  });
  it("denies direct financial reads and writes for browser roles", async () => {
    const consultant = env.authenticatedContext("u1").firestore();
    const manager = env.authenticatedContext("m1").firestore();
    await assertFails(getDoc(doc(consultant, "financialTransactions/f1")));
    await assertFails(getDoc(doc(manager, "financialTransactions/f1")));
    await assertFails(getDoc(doc(manager, "financeCustomers/c1")));
    await assertFails(getDoc(doc(manager, "vatSettlements/v1")));
    await assertFails(
      setDoc(doc(consultant, "financialTransactions/new"), {
        organizationId: "debageri",
        consultantId: "u1",
      }),
    );
    await assertFails(
      setDoc(doc(manager, "vatSettlements/new"), {
        organizationId: "debageri",
        amountMinor: 10_000,
        status: "active",
      }),
    );
  });
  it("keeps in-app notifications server-only, even for their owner", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "notifications/n1"), {
        organizationId: "debageri",
        userId: "u1",
        read: false,
      });
    });
    const consultant = env.authenticatedContext("u1").firestore();
    await assertFails(getDoc(doc(consultant, "notifications/n1")));
    await assertFails(
      setDoc(doc(consultant, "notifications/n1"), {
        organizationId: "debageri",
        userId: "u1",
        read: true,
      }),
    );
  });
  it("keeps the notification email log server-only", async () => {
    const consultant = env.authenticatedContext("u1").firestore();
    await assertFails(getDoc(doc(consultant, "emailNotifications/n1")));
    await assertFails(
      setDoc(doc(consultant, "emailNotifications/n2"), {
        organizationId: "debageri",
        recipientUserId: "u1",
      }),
    );
  });
  it("keeps AI settings and their API keys server-only, even for admins", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "users/a1"), {
        organizationId: "debageri",
        status: "active",
        role: "admin",
      });
      await setDoc(doc(db, "aiSettings/debageri"), {
        organizationId: "debageri",
        enabled: true,
        encryptedApiKeys: { anthropic: "secret" },
      });
    });
    const admin = env.authenticatedContext("a1").firestore();
    await assertFails(getDoc(doc(admin, "aiSettings/debageri")));
    await assertFails(
      setDoc(doc(admin, "aiSettings/debageri"), {
        organizationId: "debageri",
        enabled: false,
      }),
    );
  });
  it("keeps accounting email settings server-only, even for admins", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "users/a1"), {
        organizationId: "debageri",
        status: "active",
        role: "admin",
      });
      await setDoc(doc(db, "accountingEmailSettings/debageri"), {
        organizationId: "debageri",
        contacts: [],
      });
    });
    const admin = env.authenticatedContext("a1").firestore();
    await assertFails(getDoc(doc(admin, "accountingEmailSettings/debageri")));
    await assertFails(
      setDoc(doc(admin, "accountingEmailSettings/debageri"), {
        organizationId: "debageri",
        contacts: [],
      }),
    );
  });
  it("keeps receipts server-only, even for their owner", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "receipts/r1"), {
        organizationId: "debageri",
        userId: "u1",
        status: "pending",
      });
    });
    const consultant = env.authenticatedContext("u1").firestore();
    await assertFails(getDoc(doc(consultant, "receipts/r1")));
    await assertFails(
      setDoc(doc(consultant, "receipts/r2"), {
        organizationId: "debageri",
        userId: "u1",
        status: "approved",
      }),
    );
  });
  it("keeps requests and their history server-only, even for their owner", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "requests/q1"), {
        organizationId: "debageri",
        userId: "u1",
        status: "requested",
      });
      await setDoc(doc(context.firestore(), "requestEvents/e1"), {
        organizationId: "debageri",
        userId: "u1",
        requestId: "q1",
        toStatus: "requested",
      });
    });
    const consultant = env.authenticatedContext("u1").firestore();
    await assertFails(getDoc(doc(consultant, "requests/q1")));
    await assertFails(getDoc(doc(consultant, "requestEvents/e1")));
    await assertFails(
      setDoc(doc(consultant, "requests/q1"), {
        organizationId: "debageri",
        userId: "u1",
        status: "accepted",
      }),
    );
    await assertFails(
      setDoc(doc(consultant, "requestEvents/e2"), {
        organizationId: "debageri",
        userId: "u1",
        requestId: "q1",
        toStatus: "finalized",
      }),
    );
  });
  it("keeps time report files server-only, even for their owner", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "timesheetAttachments/f1"), {
        organizationId: "debageri",
        userId: "u1",
        timesheetId: "t1",
      });
    });
    const consultant = env.authenticatedContext("u1").firestore();
    await assertFails(getDoc(doc(consultant, "timesheetAttachments/f1")));
    await assertFails(deleteDoc(doc(consultant, "timesheetAttachments/f1")));
  });
  it("keeps pay slips server-only, even for their owner", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "payslips/debageri_u1_2026-09"), {
        organizationId: "debageri",
        userId: "u1",
        period: "2026-09",
      });
    });
    const consultant = env.authenticatedContext("u1").firestore();
    await assertFails(getDoc(doc(consultant, "payslips/debageri_u1_2026-09")));
    await assertFails(
      setDoc(doc(consultant, "payslips/debageri_u1_2026-10"), {
        organizationId: "debageri",
        userId: "u1",
        period: "2026-10",
      }),
    );
  });
  it("keeps payroll details, tax tables and salaries server-only", async () => {
    const paths = [
      "payrollProfiles/debageri_u1",
      "taxTables/debageri_2026_33",
      "municipalTaxRates/debageri_2026",
      "salaryRuns/debageri_2026-08",
      "salarySlips/debageri_u1_2026-08",
    ];
    await env.withSecurityRulesDisabled(async (context) => {
      for (const path of paths)
        await setDoc(doc(context.firestore(), path), {
          organizationId: "debageri",
          userId: "u1",
        });
    });
    const consultant = env.authenticatedContext("u1").firestore();
    for (const path of paths) {
      await assertFails(getDoc(doc(consultant, path)));
      await assertFails(
        setDoc(doc(consultant, path), {
          organizationId: "debageri",
          userId: "u1",
        }),
      );
    }
  });
});
