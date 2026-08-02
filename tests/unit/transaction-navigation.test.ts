import { describe, expect, it } from "vitest";
import {
  safeTransactionReturnHref,
  transactionDefaultDate,
  transactionListHref,
  transactionListState,
  transactionMonthMismatch,
  transactionViewMonth,
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

  it("uses the current day within the selected month", () => {
    const monthHref = transactionListHref({
      scope: "company",
      period: "month",
      anchor: "2026-02",
    });
    expect(transactionDefaultDate(monthHref, "2026-08-15")).toBe("2026-02-15");
    expect(transactionDefaultDate(monthHref, "2026-08-31")).toBe("2026-02-28");
  });

  it("keeps today's date for a year view", () => {
    const yearHref = transactionListHref({
      scope: "all",
      period: "year",
      anchor: "2025-01",
    });
    expect(transactionDefaultDate(yearHref, "2026-08-15")).toBe("2026-08-15");
    expect(transactionViewMonth(yearHref)).toBeNull();
  });

  it("detects a transaction outside the selected month", () => {
    const monthHref = transactionListHref({
      scope: "all",
      period: "month",
      anchor: "2026-03",
    });
    expect(transactionMonthMismatch(monthHref, "2026-07-12")).toEqual({
      viewMonth: "2026-03",
      transactionMonth: "2026-07",
    });
    expect(transactionMonthMismatch(monthHref, "2026-03-12")).toBeNull();
  });
});
