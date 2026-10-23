import { describe, expect, it } from "vitest";
import {
  formatPayslipMonth,
  isPayslipContentType,
  matchPayslipRecipient,
  payslipId,
  payslipPeriod,
} from "@/domain/payslips";
import { payslipUploadSchema } from "@/server/validators/payslips";

const recipients = [
  { id: "u1", name: "Anna Öberg", employeeNumber: "1001" },
  { id: "u2", name: "Erik Svensson", employeeNumber: "1002" },
  { id: "u3", name: "Erik Larsson", employeeNumber: "10021" },
];

describe("pay slip periods", () => {
  it("builds zero-padded periods and one id per person and month", () => {
    expect(payslipPeriod(2026, 3)).toBe("2026-03");
    expect(payslipId("debageri", "u1", "2026-03")).toBe("debageri_u1_2026-03");
  });

  it("formats month labels in both locales", () => {
    expect(formatPayslipMonth("en-SE", 2026, 9)).toMatch(/September 2026/);
    expect(formatPayslipMonth("sv-SE", 2026, 9)).toMatch(/september 2026/);
  });
});

describe("pay slip files", () => {
  it("accepts PDF and image files only", () => {
    expect(isPayslipContentType("application/pdf")).toBe(true);
    expect(isPayslipContentType("image/png")).toBe(true);
    expect(isPayslipContentType("text/plain")).toBe(false);
  });

  it("matches recipients by whole employee number", () => {
    expect(
      matchPayslipRecipient("lonebesked_1002_2026-09.pdf", recipients),
    ).toBe("u2");
    expect(matchPayslipRecipient("10021-sept.pdf", recipients)).toBe("u3");
  });

  it("matches recipients by full name, ignoring accents and case", () => {
    expect(matchPayslipRecipient("ANNA OBERG september.pdf", recipients)).toBe(
      "u1",
    );
    expect(matchPayslipRecipient("anna-öberg.png", recipients)).toBe("u1");
  });

  it("leaves unknown or ambiguous files unassigned", () => {
    expect(matchPayslipRecipient("erik.pdf", recipients)).toBeNull();
    expect(matchPayslipRecipient("payslip.pdf", recipients)).toBeNull();
  });
});

describe("pay slip upload input", () => {
  it("validates month and year", () => {
    const base = { userId: "u1", replaceExisting: false };
    expect(
      payslipUploadSchema.safeParse({ ...base, year: "2026", month: "9" })
        .success,
    ).toBe(true);
    expect(
      payslipUploadSchema.safeParse({ ...base, year: "2026", month: "13" })
        .success,
    ).toBe(false);
    expect(
      payslipUploadSchema.safeParse({ ...base, year: "1999", month: "1" })
        .success,
    ).toBe(false);
  });
});
