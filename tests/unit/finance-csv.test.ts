import { describe, expect, it } from "vitest";
import { createFinanceCsv, parseFinanceCsv } from "@/domain/finance/csv";

describe("finance CSV export", () => {
  it("round-trips commas, quotes, and line breaks", () => {
    const csv = createFinanceCsv(
      ["description", "internal_note"],
      [
        {
          description: 'Consulting, "August"',
          internal_note: "First line\nSecond line",
        },
      ],
    );

    expect(parseFinanceCsv(csv)).toEqual([
      {
        description: 'Consulting, "August"',
        internal_note: "First line\nSecond line",
      },
    ]);
  });
});
