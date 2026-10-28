import { describe, expect, it } from "vitest";
import { isIsoDate, normalizeDateText } from "@/lib/dates/date-text";

describe("isIsoDate", () => {
  it("accepts only real YYYY-MM-DD dates", () => {
    expect(isIsoDate("2026-10-03")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-10-3")).toBe(false);
    expect(isIsoDate("03/10/2026")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});

describe("normalizeDateText", () => {
  it("adds dashes and leading zeros to typed dates", () => {
    expect(normalizeDateText("20261003")).toBe("2026-10-03");
    expect(normalizeDateText("2026/10/03")).toBe("2026-10-03");
    expect(normalizeDateText("2026.10.3")).toBe("2026-10-03");
    expect(normalizeDateText(" 2026-1-5 ")).toBe("2026-01-05");
  });

  it("leaves text it cannot read as a date", () => {
    expect(normalizeDateText("2026-13-01")).toBe("2026-13-01");
    expect(normalizeDateText("202610")).toBe("202610");
    expect(normalizeDateText("10/03/2026")).toBe("10/03/2026");
  });
});
