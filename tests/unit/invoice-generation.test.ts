import { describe, expect, it } from "vitest";
import {
  formatBankgiro,
  formatOrgNumber,
  bankgiroCodeLine,
  CODE_LINE_LENGTH,
  luhnCheckDigit,
  ocrReferenceFor,
  validBankgiro,
  validOcrReference,
  validOrgNumber,
  validSwedishVatNumber,
  vatNumberFor,
} from "@/domain/finance/swedish-identifiers";
import {
  invoiceTotals,
  kronorRoundingMinor,
  lineAmountMinor,
  linesForInvoice,
  parseQuantity,
  withLineAmount,
} from "@/domain/finance/invoice-lines";
import {
  addDays,
  invoiceSettingsFrom,
  missingInvoiceSettings,
  nextNumberAfter,
} from "@/domain/finance/invoice-settings";

describe("Swedish identifiers", () => {
  it("computes Luhn check digits", () => {
    expect(luhnCheckDigit("559555842")).toBe(9);
    expect(luhnCheckDigit("5020704")).toBe(2);
  });

  it("validates the numbers on Faktura 19", () => {
    expect(validOrgNumber("559555-8429")).toBe(true);
    expect(validOrgNumber("559555-8428")).toBe(false);
    expect(validBankgiro("5020-7042")).toBe(true);
    expect(validBankgiro("5020-7043")).toBe(false);
    expect(validSwedishVatNumber("SE559555842901")).toBe(true);
    expect(validSwedishVatNumber("SE559555842801")).toBe(false);
    expect(vatNumberFor("559555-8429")).toBe("SE559555842901");
  });

  it("formats bankgiro and organization numbers", () => {
    expect(formatBankgiro("50207042")).toBe("5020-7042");
    expect(formatBankgiro("1234566")).toBe("123-4566");
    expect(formatOrgNumber("5595558429")).toBe("559555-8429");
  });

  it("builds OCR references with a length and a check digit", () => {
    expect(ocrReferenceFor("20")).toBe("2048");
    expect(validOcrReference("2048")).toBe(true);
    expect(validOcrReference("2047")).toBe(false);
    const long = ocrReferenceFor("123456789");
    expect(long).toHaveLength(11);
    expect(validOcrReference(long!)).toBe(true);
    expect(ocrReferenceFor("F-20")).toBeNull();
  });
});

describe("invoice lines", () => {
  it("adds up Faktura 19", () => {
    const line = withLineAmount({
      articleNumber: "2",
      description: "Timmar",
      quantityThousandths: 144_000,
      unit: "h",
      unitPriceMinor: 850_00,
    });
    expect(line.amountMinor).toBe(122_400_00);
    expect(invoiceTotals([line], 2500)).toEqual({
      netMinor: 122_400_00,
      vatMinor: 30_600_00,
      roundingMinor: 0,
      grossMinor: 153_000_00,
    });
  });

  it("rounds part quantities to whole öre", () => {
    expect(lineAmountMinor(7_500, 850_00)).toBe(6_375_00);
    expect(lineAmountMinor(333, 1_00)).toBe(33);
    expect(lineAmountMinor(1_005, 1)).toBe(1);
  });

  it("rounds totals to whole kronor", () => {
    expect(kronorRoundingMinor(153_000_40)).toBe(-40);
    expect(kronorRoundingMinor(153_000_60)).toBe(40);
    expect(kronorRoundingMinor(153_000_50)).toBe(50);
    expect(kronorRoundingMinor(153_000_00)).toBe(0);
  });

  it("parses quantities", () => {
    expect(parseQuantity("144")).toBe(144_000);
    expect(parseQuantity("7,5")).toBe(7_500);
    expect(parseQuantity("0.125")).toBe(125);
    expect(parseQuantity("1,2345")).toBeNaN();
    expect(parseQuantity("abc")).toBeNaN();
  });

  it("prints older invoices as one row", () => {
    expect(
      linesForInvoice({ netMinor: 1000_00, visibleDescription: "Konsult" }),
    ).toEqual([
      {
        articleNumber: "",
        description: "Konsult",
        quantityThousandths: 1000,
        unit: "st",
        unitPriceMinor: 1000_00,
        amountMinor: 1000_00,
      },
    ]);
  });
});

describe("invoice settings", () => {
  it("fills defaults and lists what is missing", () => {
    const settings = invoiceSettingsFrom(undefined, "Debageri AB");
    expect(settings.legalName).toBe("Debageri AB");
    expect(settings.nextInvoiceNumber).toBe(1);
    expect(missingInvoiceSettings(settings)).toEqual([
      "addressLine",
      "postalCode",
      "city",
      "orgNumber",
      "vatNumber",
      "bankgiro",
    ]);
  });

  it("moves the number counter past the number used", () => {
    expect(nextNumberAfter(20, "20")).toBe(21);
    expect(nextNumberAfter(20, "25")).toBe(26);
    expect(nextNumberAfter(20, "7")).toBe(20);
    expect(nextNumberAfter(20, "F-30")).toBe(20);
  });

  it("adds payment term days", () => {
    expect(addDays("2026-10-01", 37)).toBe("2026-11-07");
  });
});

describe("bankgiro code line", () => {
  it("lays out Faktura 19's line as Bankgirot specifies", () => {
    const line = bankgiroCodeLine({
      ocrReference: "587592460760850",
      amountMinor: 153_000_00,
      bankgiro: "5020-7042",
    });
    expect(line).toBe(
      "H" +
        " ".repeat(3) +
        "#" +
        " ".repeat(11) +
        "587592460760850" +
        " #  " +
        "153000" +
        " 00   5 >" +
        " ".repeat(17) +
        "50207042#41#" +
        " ".repeat(4),
    );
    expect(line).toHaveLength(CODE_LINE_LENGTH);
  });

  it("right-aligns short bankgiro numbers and small amounts", () => {
    const line = bankgiroCodeLine({
      ocrReference: "2048",
      amountMinor: 1_50,
      bankgiro: "123-4566",
    })!;
    // A seven-digit bankgiro leaves position 16 blank.
    expect(line.slice(-17)).toBe("  1234566#41#    ");
    expect(line).toContain(" 1 50   ");
    expect(line).toContain("2048 #");
  });

  it("refuses details that cannot be scanned", () => {
    const valid = {
      ocrReference: "2048",
      amountMinor: 100,
      bankgiro: "123-4566",
    };
    expect(bankgiroCodeLine({ ...valid, ocrReference: "2047" })).toBeNull();
    expect(bankgiroCodeLine({ ...valid, bankgiro: "123-4567" })).toBeNull();
    expect(bankgiroCodeLine({ ...valid, amountMinor: 0 })).toBeNull();
    expect(
      bankgiroCodeLine({ ...valid, amountMinor: 1_000_000_000_00 }),
    ).toBeNull();
  });
});
