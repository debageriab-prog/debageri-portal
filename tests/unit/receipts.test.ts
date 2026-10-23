import { describe, expect, it } from "vitest";
import {
  canBecomeExpense,
  filterReceipts,
  isReceiptContentType,
  isReceiptStatus,
  receiptVatRateBps,
} from "@/domain/receipts";
import {
  receiptReviewSchema,
  receiptUploadSchema,
} from "@/server/validators/receipts";
import { financeActionSchema } from "@/server/validators/finance";

const receipts = [
  { id: "r1", userId: "u1", date: "2026-09-03", status: "pending" as const },
  { id: "r2", userId: "u2", date: "2026-09-30", status: "approved" as const },
  { id: "r3", userId: "u1", date: "2026-10-01", status: "rejected" as const },
];

describe("receipt filters", () => {
  it("filters by month, status and person together", () => {
    const ids = (filter: Parameters<typeof filterReceipts>[1]) =>
      filterReceipts(receipts, filter).map((item) => item.id);
    expect(ids({ period: null, status: "all" })).toEqual(["r1", "r2", "r3"]);
    expect(ids({ period: "2026-09", status: "all" })).toEqual(["r1", "r2"]);
    expect(ids({ period: null, status: "pending" })).toEqual(["r1"]);
    expect(ids({ period: "2026", status: "all" })).toEqual(["r1", "r2", "r3"]);
    expect(ids({ period: "2025", status: "all" })).toEqual([]);
    expect(ids({ period: null, status: "all", userId: "u1" })).toEqual([
      "r1",
      "r3",
    ]);
  });
});

describe("receipt rules", () => {
  it("only books approved receipts that have no expense yet", () => {
    expect(
      canBecomeExpense({ status: "approved", expenseTransactionId: null }),
    ).toBe(true);
    expect(
      canBecomeExpense({ status: "approved", expenseTransactionId: "t1" }),
    ).toBe(false);
    expect(
      canBecomeExpense({ status: "pending", expenseTransactionId: null }),
    ).toBe(false);
  });

  it("accepts PDF and image files and known statuses", () => {
    expect(isReceiptContentType("application/pdf")).toBe(true);
    expect(isReceiptContentType("image/webp")).toBe(true);
    expect(isReceiptContentType("text/plain")).toBe(false);
    expect(isReceiptStatus("rejected")).toBe(true);
    expect(isReceiptStatus("paid")).toBe(false);
  });
});

const amounts = { netMinor: "10000", vatMinor: "2500" };

describe("receipt VAT rate", () => {
  it("derives the VAT rate used to prefill an expense", () => {
    expect(receiptVatRateBps(10_000, 2_500)).toBe(2_500);
    expect(receiptVatRateBps(10_000, 1_200)).toBe(1_200);
    expect(receiptVatRateBps(10_000, 600)).toBe(600);
    expect(receiptVatRateBps(10_000, 0)).toBe(0);
    expect(receiptVatRateBps(0, 0)).toBe(0);
  });
});

describe("receipt input", () => {
  it("requires a date and name, with an optional description", () => {
    expect(
      receiptUploadSchema.safeParse({
        ...amounts,
        date: "2026-10-01",
        name: "Taxi",
      }).success,
    ).toBe(true);
    expect(
      receiptUploadSchema.safeParse({
        ...amounts,
        date: "2026-10-01",
        name: " ",
      }).success,
    ).toBe(false);
    expect(
      receiptUploadSchema.safeParse({
        ...amounts,
        date: "01/10/2026",
        name: "Taxi",
      }).success,
    ).toBe(false);
  });

  it("requires a positive amount and VAT no higher than it", () => {
    const base = { date: "2026-10-01", name: "Taxi" };
    expect(
      receiptUploadSchema.safeParse({ ...base, netMinor: "0", vatMinor: "0" })
        .success,
    ).toBe(false);
    expect(
      receiptUploadSchema.safeParse({
        ...base,
        netMinor: "100",
        vatMinor: "101",
      }).success,
    ).toBe(false);
    expect(
      receiptUploadSchema.safeParse({
        ...base,
        netMinor: "10000",
        vatMinor: "0",
      }).success,
    ).toBe(true);
    expect(
      receiptUploadSchema.safeParse({
        ...base,
        netMinor: "12.5",
        vatMinor: "0",
      }).success,
    ).toBe(false);
  });

  it("only allows approving or rejecting", () => {
    expect(receiptReviewSchema.safeParse({ status: "approved" }).success).toBe(
      true,
    );
    expect(receiptReviewSchema.safeParse({ status: "pending" }).success).toBe(
      false,
    );
  });

  it("lets an expense reference the receipt it was created from", () => {
    const expense = {
      action: "createTransaction",
      direction: "expense",
      categoryId: "c1",
      consultantId: "u1",
      date: "2026-10-01",
      amountMode: "gross",
      amountMinor: 12_500,
      vatRateBps: 2_500,
      funding: "consultant",
    };
    const plain = financeActionSchema.safeParse(expense);
    const linked = financeActionSchema.safeParse({
      ...expense,
      receiptId: "r2",
    });
    expect(plain.success && plain.data).toMatchObject({ receiptId: null });
    expect(linked.success && linked.data).toMatchObject({ receiptId: "r2" });
  });
});
