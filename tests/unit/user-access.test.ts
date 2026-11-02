import { describe, expect, it } from "vitest";
import {
  employmentDatesValid,
  receivesDocuments,
} from "@/server/validators/user-access";

describe("employment end date", () => {
  it("rejects an end date before the start date", () => {
    expect(employmentDatesValid("2026-07-15", "2026-07-14")).toBe(false);
    expect(employmentDatesValid("2026-07-15", "2026-07-15")).toBe(true);
    expect(employmentDatesValid("2026-07-15", null)).toBe(true);
    expect(employmentDatesValid(null, "2026-07-15")).toBe(true);
  });

  it("keeps former employees available for documents", () => {
    expect(receivesDocuments({ status: "active" })).toBe(true);
    expect(
      receivesDocuments({ status: "active", employmentEndDate: "2026-07-15" }),
    ).toBe(true);
    expect(
      receivesDocuments({
        status: "inactive",
        employmentEndDate: "2026-07-15",
      }),
    ).toBe(true);
    expect(receivesDocuments({ status: "inactive" })).toBe(false);
  });
});
