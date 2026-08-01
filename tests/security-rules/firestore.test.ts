import { afterAll, beforeAll, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc } from "firebase/firestore";

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
  });
});
afterAll(async () => env.cleanup());
describe("Firestore rules", () => {
  it("prevents employee cross-user reads", async () => {
    const db = env.authenticatedContext("u1").firestore();
    await assertSucceeds(getDoc(doc(db, "timesheets/s1")));
    await assertFails(getDoc(doc(db, "timesheets/s2")));
  });
  it("allows managers to read consultant reports across the organization", async () => {
    const db = env.authenticatedContext("m1").firestore();
    await assertSucceeds(getDoc(doc(db, "timesheets/s1")));
    await assertSucceeds(getDoc(doc(db, "timesheets/s2")));
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
    await assertFails(
      setDoc(doc(consultant, "financialTransactions/new"), {
        organizationId: "debageri",
        consultantId: "u1",
      }),
    );
  });
});
