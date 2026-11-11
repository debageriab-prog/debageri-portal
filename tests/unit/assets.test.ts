import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  activePurchaseValueMinor,
  assetHolderFrom,
  canAcceptHandover,
  canCancelHandover,
  canChangeHolder,
  canEditAsset,
  canIssueHandover,
  canLinkTransaction,
  canReturnHandover,
  canSell,
  filterAssets,
  handoverLine,
  type AssetState,
} from "@/domain/assets";
import { can } from "@/domain/access/permissions";
import { assetReceiptPdf } from "@/server/export/asset-receipt-pdf";
import {
  assetActionSchema,
  assetFormSchema,
  handoverActionSchema,
  handoverIssueSchema,
} from "@/server/validators/assets";
import en from "@/locales/en.json";
import { rolePermissions } from "./role-permissions";

const state = (overrides: Partial<AssetState> = {}): AssetState => ({
  status: "active",
  activeHandoverId: null,
  handoverStatus: null,
  purchasePriceMinor: 1_299_00,
  purchaseTransactionId: null,
  sale: null,
  saleTransactionId: null,
  ...overrides,
});

describe("asset rules", () => {
  it("hands out and moves only free, active equipment", () => {
    expect(canIssueHandover(state())).toBe(true);
    expect(canChangeHolder(state())).toBe(true);
    const handedOut = state({
      activeHandoverId: "h1",
      handoverStatus: "accepted",
    });
    expect(canIssueHandover(handedOut)).toBe(false);
    expect(canChangeHolder(handedOut)).toBe(false);
    expect(canIssueHandover(state({ status: "sold" }))).toBe(false);
  });

  it("sells equipment unless a receipt still waits for acceptance", () => {
    expect(canSell(state())).toBe(true);
    expect(
      canSell(state({ activeHandoverId: "h1", handoverStatus: "accepted" })),
    ).toBe(true);
    expect(
      canSell(state({ activeHandoverId: "h1", handoverStatus: "pending" })),
    ).toBe(false);
    expect(canSell(state({ status: "lost" }))).toBe(false);
  });

  it("stops edits once the equipment has left the company", () => {
    expect(canEditAsset({ status: "active" })).toBe(true);
    expect(canEditAsset({ status: "sold" })).toBe(false);
  });

  it("lets only the recipient accept a pending receipt", () => {
    const pending = { status: "pending" as const, recipientUserId: "u1" };
    expect(canAcceptHandover(pending, "u1")).toBe(true);
    expect(canAcceptHandover(pending, "u2")).toBe(false);
    expect(canAcceptHandover({ ...pending, status: "accepted" }, "u1")).toBe(
      false,
    );
    expect(canCancelHandover(pending)).toBe(true);
    expect(canReturnHandover(pending)).toBe(false);
    expect(canReturnHandover({ status: "accepted" })).toBe(true);
  });

  it("books a purchase and a sale once each", () => {
    expect(canLinkTransaction(state(), "purchase")).toBe(true);
    expect(
      canLinkTransaction(state({ purchaseTransactionId: "t1" }), "purchase"),
    ).toBe(false);
    expect(
      canLinkTransaction(state({ purchasePriceMinor: 0 }), "purchase"),
    ).toBe(false);
    expect(canLinkTransaction(state(), "sale")).toBe(false);
    const sold = state({
      status: "sold",
      sale: {
        date: "2026-11-01",
        priceMinor: 500_00,
        buyerType: "external",
        buyerUserId: null,
        buyerName: "Erik",
      },
    });
    expect(canLinkTransaction(sold, "sale")).toBe(true);
    expect(
      canLinkTransaction({ ...sold, saleTransactionId: "t2" }, "sale"),
    ).toBe(false);
  });

  it("reads stored holders safely", () => {
    expect(assetHolderFrom(undefined)).toEqual({
      type: "company",
      userId: null,
      name: "",
      location: "",
    });
    expect(
      assetHolderFrom({ type: "user", userId: "u1", name: "Anna" }),
    ).toEqual({ type: "user", userId: "u1", name: "Anna", location: "" });
    expect(assetHolderFrom({ type: "weird", name: "x" }).type).toBe("company");
  });

  it("builds receipt lines and remembers the previous holder", () => {
    const holder = assetHolderFrom({ type: "company", location: "Office" });
    expect(
      handoverLine({
        id: "a1",
        name: "Mobile phone",
        make: "Google",
        model: "Pixel 11 Pro",
        serialNumber: "353",
        accessories: "",
        holder,
      }),
    ).toEqual({
      assetId: "a1",
      equipment: "Mobile phone",
      makeModel: "Google Pixel 11 Pro",
      serialNumber: "353",
      accessories: "",
      previousHolder: holder,
    });
  });

  it("filters the register and sums what active equipment cost", () => {
    const base = {
      category: "phone" as const,
      make: "Google",
      model: "Pixel",
      serialNumber: "",
      purchasePriceMinor: 100_00,
    };
    const assets = [
      {
        ...base,
        name: "Phone",
        status: "active" as const,
        holder: assetHolderFrom({ type: "user", userId: "u1", name: "Anna" }),
      },
      {
        ...base,
        name: "Drive",
        category: "storage" as const,
        status: "sold" as const,
        holder: assetHolderFrom({ type: "external", name: "Erik" }),
      },
    ];
    const all = { status: "all", category: "all", holder: "all", search: "" };
    expect(
      filterAssets(assets, { ...all, holder: "user:u1" } as never),
    ).toHaveLength(1);
    expect(
      filterAssets(assets, { ...all, search: "erik" } as never)[0]?.name,
    ).toBe("Drive");
    expect(
      filterAssets(assets, { ...all, status: "active" } as never),
    ).toHaveLength(1);
    expect(activePurchaseValueMinor(assets)).toBe(100_00);
  });
});

describe("asset permissions", () => {
  it("gives managers and accountants the register and consultants their own", () => {
    for (const role of ["manager", "accountant"] as const) {
      const user = { permissions: rolePermissions(role) };
      expect(can(user, "assets.view")).toBe(true);
      expect(can(user, "assets.manage")).toBe(true);
      expect(can(user, "my.assets")).toBe(true);
    }
    const consultant = { permissions: rolePermissions("consultant") };
    expect(can(consultant, "my.assets")).toBe(true);
    expect(can(consultant, "assets.view")).toBe(false);
  });
});

describe("asset validators", () => {
  const form = {
    name: "Mobile phone",
    category: "phone",
    purchasePriceMinor: "1299900",
    vatRateBps: "2500",
    purchaseDate: "",
  };

  it("accepts equipment and leaves out an empty date", () => {
    const parsed = assetFormSchema.parse(form);
    expect(parsed.purchasePriceMinor).toBe(1_299_900);
    expect(parsed.purchaseDate).toBeNull();
  });

  it("rejects unknown categories, fractions of öre and odd VAT", () => {
    expect(
      assetFormSchema.safeParse({ ...form, category: "car" }).success,
    ).toBe(false);
    expect(
      assetFormSchema.safeParse({ ...form, purchasePriceMinor: "1.5" }).success,
    ).toBe(false);
    expect(
      assetFormSchema.safeParse({ ...form, vatRateBps: "1000" }).success,
    ).toBe(false);
  });

  it("needs a name for someone outside and a buyer for a sale", () => {
    expect(
      assetActionSchema.safeParse({ action: "holder", type: "external" })
        .success,
    ).toBe(false);
    expect(
      assetActionSchema.safeParse({ action: "holder", type: "company" })
        .success,
    ).toBe(true);
    const sale = {
      action: "sell",
      date: "2026-11-11",
      priceMinor: 50_000,
      buyerType: "user",
    };
    expect(assetActionSchema.safeParse(sale).success).toBe(false);
    expect(
      assetActionSchema.safeParse({ ...sale, buyerUserId: "u1" }).success,
    ).toBe(true);
    expect(
      assetActionSchema.safeParse({
        ...sale,
        buyerType: "external",
        buyerName: "Erik",
      }).success,
    ).toBe(true);
  });

  it("issues receipts for distinct equipment and requires the confirmation", () => {
    expect(
      handoverIssueSchema.safeParse({
        recipientUserId: "u1",
        assetIds: ["a1", "a1"],
      }).success,
    ).toBe(false);
    expect(
      handoverIssueSchema.safeParse({ recipientUserId: "u1", assetIds: [] })
        .success,
    ).toBe(false);
    expect(
      handoverActionSchema.safeParse({ action: "accept", place: "Gothenburg" })
        .success,
    ).toBe(false);
    expect(
      handoverActionSchema.safeParse({
        action: "accept",
        place: "Gothenburg",
        confirm: true,
      }).success,
    ).toBe(true);
  });
});

describe("equipment receipt PDF", () => {
  const labels = {
    title: en.assetReceiptTitle,
    company: en.assetReceiptCompany,
    orgNumber: en.assetReceiptOrgNumber,
    recipient: en.assetReceiptRecipient,
    personalNumber: en.assetReceiptPersonalNumber,
    date: en.date,
    issuedEquipment: en.assetReceiptIssuedEquipment,
    equipment: en.assetReceiptEquipment,
    makeModel: en.assetReceiptMakeModel,
    serialNumber: en.assetReceiptSerialNumber,
    accessories: en.assetAccessories,
    noAccessories: en.assetReceiptNoAccessories,
    terms: en.assetReceiptTerms,
    confirmation: en.assetReceiptConfirmation,
    confirmationText: en.assetReceiptConfirmationText,
    placeAndDate: en.assetReceiptPlaceAndDate,
    recipientHeading: en.assetReceiptRecipientHeading,
    name: en.name,
    signature: en.assetReceiptSignature,
    signedElectronically: "Accepted electronically by Anna",
    notYetAccepted: en.assetReceiptNotYetAccepted,
    termLines: [en.assetTerms_1, en.assetTerms_2],
  };

  /** The text drawn on every page, from the compressed content streams. */
  function pdfTextOf(pdf: Buffer) {
    const raw = pdf.toString("latin1");
    const streams = [...raw.matchAll(/stream\n([\s\S]*?)\nendstream/g)];
    return streams
      .map((match) => inflateSync(Buffer.from(match[1]!, "latin1")).toString())
      .join("\n");
  }

  it("lists the equipment, the company and the electronic signature", () => {
    const pdf = assetReceiptPdf({
      company: { legalName: "Debageri AB", orgNumber: "559000-0000" },
      recipientName: "Anna Svensson",
      personalNumber: "19900101-1234",
      issuedOn: "2026-08-21",
      lines: [
        {
          equipment: "Mobile phone",
          makeModel: "Google Pixel 11 Pro",
          serialNumber: "353373064",
          accessories: "",
        },
      ],
      accepted: {
        place: "Gothenburg",
        date: "2026-08-21",
        dateTime: "2026-08-21 14:05",
      },
      labels,
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const text = pdfTextOf(pdf);
    expect(text).toContain("353373064");
    expect(text).toContain("Debageri AB");
    expect(text).toContain("19900101-1234");
    expect(text).toContain("2026-08-21 Gothenburg");
    expect(text).toContain("Accepted electronically by Anna");
  });

  it("leaves out the personal number and marks a receipt not yet accepted", () => {
    const text = pdfTextOf(
      assetReceiptPdf({
        company: { legalName: "Debageri AB", orgNumber: "" },
        recipientName: "Anna",
        personalNumber: "",
        issuedOn: "2026-08-21",
        lines: Array.from({ length: 40 }, (_, index) => ({
          equipment: `Monitor ${index}`,
          makeModel: "Dell",
          serialNumber: `SN${index}`,
          accessories: "Cable",
        })),
        accepted: null,
        labels,
      }),
    );
    expect(text).not.toContain(en.assetReceiptPersonalNumber);
    expect(text).toContain(en.assetReceiptNotYetAccepted);
    expect(text).toContain("SN39");
  });
});
