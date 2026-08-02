import { describe, expect, it } from "vitest";
import {
  safeTransactionReturnHref,
  transactionListHref,
  transactionListState,
} from "@/app/finance/transaction-navigation";

describe("transaction list navigation", () => {
  it("round-trips the selected scope and period", () => {
    const href = transactionListHref({
      scope: "consultant-1",
      period: "year",
      anchor: "2025-01",
    });
    const params = new URL(href, "https://portal.invalid").searchParams;
    expect(transactionListState(params, "2026-08")).toEqual({
      scope: "consultant-1",
      period: "year",
      anchor: "2025-01",
    });
    expect(safeTransactionReturnHref(href)).toBe(href);
  });

  it("rejects external and malformed return locations", () => {
    expect(safeTransactionReturnHref("https://example.com/finance")).toBe(
      "/finance?section=transactions",
    );
    expect(safeTransactionReturnHref("/admin/users")).toBe(
      "/finance?section=transactions",
    );
  });
});
