import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import sv from "@/locales/sv.json";
import { withLineAmount } from "@/domain/finance/invoice-lines";
import { bankgiroCodeLine } from "@/domain/finance/swedish-identifiers";
import { invoiceSettingsFrom } from "@/domain/finance/invoice-settings";
import {
  invoiceFileName,
  invoicePdf,
  type InvoicePdfInput,
  type InvoicePdfLabels,
} from "@/server/export/invoice-pdf";
import { pdfText, wrapText } from "@/server/export/pdf-document";

const labelNames: Array<keyof InvoicePdfLabels> = [
  "title",
  "invoiceDate",
  "invoiceNumber",
  "ocr",
  "bankgiro",
  "plusgiro",
  "dueDate",
  "ourReference",
  "yourReference",
  "paymentTerms",
  "paymentTermsDays",
  "lateInterest",
  "customerNumber",
  "customerOrgNumber",
  "customerVatNumber",
  "articleNumber",
  "description",
  "quantity",
  "unit",
  "unitPrice",
  "amount",
  "vatLine",
  "net",
  "vat",
  "rounding",
  "toPay",
  "payWithOcr",
  "payWithReference",
  "payToBankgiro",
  "payToPlusgiro",
  "iban",
  "bic",
  "address",
  "contact",
  "registration",
  "payment",
  "phone",
  "email",
  "orgNumber",
  "vatNumber",
  "fSkatt",
  "page",
  "slipTitle",
  "slipHowToPay",
  "slipToPay",
  "slipToBankgiro",
  "slipDueBy",
  "slipFee",
  "slipPayer",
  "slipBankgiroBox",
  "slipPayee",
  "slipNoChanges",
  "slipNoMessages",
  "slipMachineRead",
  "slipReference",
  "slipKronor",
  "slipOre",
];

const labels = Object.fromEntries(
  labelNames.map((name) => [
    name,
    (sv as Record<string, string>)[`invoicePdf_${name}`]!,
  ]),
) as InvoicePdfLabels;

/** Faktura 19 as the portal would print it, paid to the company's own bankgiro. */
export function sampleInvoice(
  overrides: Partial<InvoicePdfInput> = {},
): InvoicePdfInput {
  return {
    issuer: invoiceSettingsFrom({
      legalName: "Debageri AB",
      addressLine: "Eketrägatan 12 C 1202",
      postalCode: "418 73",
      city: "Göteborg",
      phone: "+46720710673",
      email: "info@debageri.se",
      orgNumber: "559555-8429",
      vatNumber: "SE559555842901",
      fSkatt: true,
      bankgiro: "123-4566",
      lateInterestText: "Referensränta + 8,0 %",
    }),
    customer: {
      name: "EPICO AB",
      addressLine: "Sveavägen 52",
      postalCode: "111 34",
      city: "STOCKHOLM",
      country: "Sverige",
      customerNumber: "2",
      orgNumber: "",
      vatNumber: "",
    },
    invoiceNumber: "20",
    issueDate: "2026-11-02",
    dueDate: "2026-12-02",
    ocrReference: "2048",
    ourReference: "Vahid Bafghi",
    yourReference: "Job nr 52982",
    paymentTermsDays: 30,
    lines: [
      withLineAmount({
        articleNumber: "2",
        description: "Timmar",
        quantityThousandths: 144_000,
        unit: "h",
        unitPriceMinor: 850_00,
      }),
    ],
    invoiceText:
      "Avser arbetade timmar 2026-10 Okt\nKonsult: Vahid Bafghi\nJob nr: 52982",
    vatRateBps: 2500,
    netMinor: 122_400_00,
    vatMinor: 30_600_00,
    roundingMinor: 0,
    grossMinor: 153_000_00,
    codeLine: bankgiroCodeLine({
      ocrReference: "2048",
      amountMinor: 153_000_00,
      bankgiro: "123-4566",
    }),
    labels,
    ...overrides,
  };
}

function streams(pdf: Buffer) {
  const source = pdf.toString("latin1");
  return {
    source,
    text: [...source.matchAll(/stream\n([\s\S]*?)\nendstream/g)]
      .map((match) =>
        inflateSync(Buffer.from(match[1]!, "latin1")).toString("latin1"),
      )
      .join("\n"),
  };
}

describe("invoice PDF", () => {
  it("prints the invoice facts, rows, totals and payment", () => {
    const { source, text } = streams(invoicePdf(sampleInvoice()));
    expect(source.startsWith("%PDF-1.4")).toBe(true);
    expect(source).toContain("/Count 1");
    for (const expected of [
      "(Faktura)",
      "(Debageri AB)",
      "(EPICO AB)",
      "(Sveavägen 52)",
      "(111 34 STOCKHOLM)",
      "(2048)",
      "(Vahid Bafghi)",
      "(Job nr 52982)",
      "(30 dagar)",
      "(Timmar)",
      "(144)",
      "(Konsult: Vahid Bafghi)",
      "(Godkänd för F-skatt)",
    ])
      expect(text).toContain(expected);
    // Swedish amounts use a non-breaking space between thousands.
    expect(text).toContain("122 400,00");
    expect(text).toContain("153 000,00 SEK");
    // Sweden is not printed as the customer's country.
    expect(text).not.toContain("(Sverige)");
  });

  it("ends with a payment slip that bank apps can scan", () => {
    const { source, text } = streams(invoicePdf(sampleInvoice()));
    // Faktura 19's contents still fit on one page with the slip.
    expect(source).toContain("/Count 1");
    expect(source).toContain("/BaseFont /Courier-Bold");
    expect(text).toContain("(INBETALNING / GIRERING AVI)");
    expect(text).toContain("(Betalningsmottagare)");
    // The code line is set in Courier Bold 12, ten characters per inch.
    expect(text).toMatch(
      /\/F3 12 Tf [^(]*\(H {3}# +2048 # +153000 00 +\d > +1234566#41# {4}\) Tj/,
    );
    // The slip replaces the payment box and the page footer.
    expect(text).not.toContain("Ange OCR-nummer 2048.");
    expect(text).not.toContain("(Registrering)");
  });

  it("asks for the invoice number when there is no OCR", () => {
    const { text } = streams(
      invoicePdf(sampleInvoice({ ocrReference: null, codeLine: null })),
    );
    expect(text).toContain("Ange fakturanummer 20 som referens.");
    expect(text).not.toContain("(OCR-nummer)");
  });

  it("asks for payment to the plusgiro when there is no bankgiro", () => {
    const issuer = {
      ...sampleInvoice().issuer,
      bankgiro: "",
      plusgiro: "12 34 56-6",
    };
    const { text } = streams(
      invoicePdf(sampleInvoice({ issuer, codeLine: null })),
    );
    expect(text).toContain("till plusgiro 12 34 56-6 senast 2026-12-02.");
    expect(text).toContain("(Plusgiro)");
    expect(text).not.toContain("(Bankgiro)");
    expect(text).not.toContain("(INBETALNING / GIRERING AVI)");
  });

  it("moves long invoices onto more pages", () => {
    const line = sampleInvoice().lines[0]!;
    const { source, text } = streams(
      invoicePdf(sampleInvoice({ lines: Array(60).fill(line) })),
    );
    expect(source).toContain("/Count 3");
    expect(text).toContain("(Sida 1 av 3)");
  });

  it("wraps text to the given width", () => {
    expect(wrapText("one two three four", 40, 10)).toEqual([
      "one two",
      "three",
      "four",
    ]);
    expect(wrapText("a\nb", 100, 10)).toEqual(["a", "b"]);
  });

  it("writes dashes and quotes the standard fonts lack as plain ones", () => {
    expect(pdfText("2026-10-01 – 2026-10-31")).toBe("2026-10-01 - 2026-10-31");
    expect(pdfText("“OK” …")).toBe('"OK" ...');
    expect(pdfText("\u{1F600}")).toBe("?");
  });

  it("names the file after the invoice", () => {
    expect(invoiceFileName("Faktura", "20")).toBe("Faktura 20.pdf");
    expect(invoiceFileName("Invoice", "A/7")).toBe("Invoice A-7.pdf");
  });
});
