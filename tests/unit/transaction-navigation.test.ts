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
      from: "2025-01-01",
      to: "2025-01-31",
    });
    const params = new URL(href, "https://portal.invalid").searchParams;
    expect(transactionListState(params, "2026-08")).toEqual({
      scope: "consultant-1",
      period: "year",
      anchor: "2025-01",
      from: "2025-01-01",
      to: "2025-01-31",
    });
    expect(safeTransactionReturnHref(href)).toBe(href);
  });

  it("round-trips an inclusive date range", () => {
    const href = transactionListHref({
      scope: "all",
      period: "range",
      anchor: "2026-02",
      from: "2026-01-15",
      to: "2026-02-20",
    });
    const params = new URL(href, "https://portal.invalid").searchParams;
    expect(transactionListState(params, "2026-08")).toEqual({
      scope: "all",
      period: "range",
      anchor: "2026-02",
      from: "2026-01-15",
      to: "2026-02-20",
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
