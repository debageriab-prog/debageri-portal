import { describe, expect, it } from "vitest";
import {
  accountingContactsFrom,
  accountingRecipientLabel,
  accountingRecipients,
} from "@/domain/accounting-email";
import {
  accountingContactsSchema,
  sendAccountingEmailSchema,
} from "@/server/validators/accounting-email";

const contact = {
  id: "c1",
  name: "Redovisningsbyrån",
  email: "ekonomi@byran.se",
  transactions: true,
  invoices: false,
  vatSettlements: true,
};

describe("accounting contacts", () => {
  it("keeps valid stored contacts and drops malformed ones", () => {
    expect(
      accountingContactsFrom([
        contact,
        { id: "c2", name: "No email", email: "" },
        null,
        "text",
      ]),
    ).toEqual([contact]);
    expect(accountingContactsFrom(undefined)).toEqual([]);
  });

  it("picks recipients by purpose", () => {
    const other = {
      ...contact,
      id: "c2",
      email: "b@x.se",
      transactions: false,
    };
    expect(
      accountingRecipients([contact, other], "transactions").map(
        (item) => item.id,
      ),
    ).toEqual(["c1"]);
    expect(accountingRecipients([contact, other], "invoices")).toEqual([]);
    expect(accountingRecipientLabel(contact)).toBe(
      "Redovisningsbyrån <ekonomi@byran.se>",
    );
  });
});

describe("accounting email validation", () => {
  it("checks the email address and normalises it", () => {
    const parsed = accountingContactsSchema.safeParse({
      contacts: [{ ...contact, email: " Ekonomi@Byran.SE " }],
    });
    expect(parsed.data?.contacts[0]?.email).toBe("ekonomi@byran.se");
    expect(
      accountingContactsSchema.safeParse({
        contacts: [{ ...contact, email: "not-an-email" }],
      }).success,
    ).toBe(false);
    expect(
      accountingContactsSchema.safeParse({
        contacts: [{ ...contact, name: " " }],
      }).success,
    ).toBe(false);
  });

  it("rejects the same address twice", () => {
    expect(
      accountingContactsSchema.safeParse({
        contacts: [
          contact,
          { ...contact, id: "c2", email: "EKONOMI@byran.se" },
        ],
      }).success,
    ).toBe(false);
  });

  it("only sends known record types", () => {
    expect(
      sendAccountingEmailSchema.safeParse({
        entityType: "invoice",
        entityId: "i1",
      }).success,
    ).toBe(true);
    expect(
      sendAccountingEmailSchema.safeParse({
        entityType: "payslip",
        entityId: "p1",
      }).success,
    ).toBe(false);
  });
});
