import { deflateSync, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  activePurchaseValueMinor,
  assetHolderFrom,
  canAcceptHandover,
  canCancelHandover,
  canChangeHolder,
  canDeleteAsset,
  canEditAsset,
  canIssueHandover,
  canLinkTransaction,
  canReturnHandover,
  canSell,
  filterAssets,
  assetDisplayStatus,
  assetPartsFrom,
  assetPriceMinor,
  handoverLines,
  hasSignatureInk,
  isAssetExpenseCategory,
  type AssetState,
} from "@/domain/assets";
import { can } from "@/domain/access/permissions";
import { assetReceiptPdf } from "@/server/export/asset-receipt-pdf";
import { pngAlpha } from "@/server/export/png";
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

  it("builds a receipt row for each item and remembers the previous holder", () => {
    const holder = assetHolderFrom({ type: "company", location: "Office" });
    const part = {
      make: "Apple",
      serialNumber: "",
      accessories: "",
      priceMinor: 0,
    };
    expect(
      handoverLines({
        id: "a1",
        name: "iPad Pro with Pencil",
        parts: [
          { ...part, name: "Tablet", model: "iPad Pro", serialNumber: "353" },
          { ...part, name: "", model: "Pencil Pro" },
        ],
        holder,
      }),
    ).toEqual([
      {
        assetId: "a1",
        equipment: "Tablet",
        makeModel: "Apple iPad Pro",
        serialNumber: "353",
        accessories: "",
        previousHolder: holder,
      },
      {
        assetId: "a1",
        equipment: "iPad Pro with Pencil",
        makeModel: "Apple Pencil Pro",
        serialNumber: "",
        accessories: "",
        previousHolder: holder,
      },
    ]);
  });

  it("reads assets saved before items as one item, and adds up the price", () => {
    expect(
      assetPartsFrom({
        name: "Mobile phone",
        make: "Google",
        model: "Pixel",
        serialNumber: "353",
        accessories: "Charger",
        purchasePriceMinor: 1_299_900,
      }),
    ).toEqual([
      {
        name: "Mobile phone",
        make: "Google",
        model: "Pixel",
        serialNumber: "353",
        accessories: "Charger",
        priceMinor: 1_299_900,
      },
    ]);
    const parts = assetPartsFrom({
      name: "iPad",
      parts: [
        { name: "Tablet", priceMinor: 1_829_000 },
        { name: "Stylus", priceMinor: 159_000 },
      ],
    });
    expect(parts.map((part) => part.name)).toEqual(["Tablet", "Stylus"]);
    expect(assetPriceMinor(parts, 9_900)).toBe(1_997_900);
  });

  it("filters the register and sums what active equipment cost", () => {
    const base = {
      category: "phone" as const,
      parts: assetPartsFrom({ name: "Phone", make: "Google", model: "Pixel" }),
      purchasePriceMinor: 100_00,
      handoverStatus: null,
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
      filterAssets(assets, { ...all, status: "handedOver" } as never),
    ).toHaveLength(1);
    expect(
      filterAssets(assets, { ...all, status: "sold" } as never),
    ).toHaveLength(1);
    expect(activePurchaseValueMinor(assets)).toBe(100_00);
  });
});

describe("display status", () => {
  const company = assetHolderFrom({ type: "company" });
  const anna = assetHolderFrom({ type: "user", userId: "u1", name: "Anna" });
  it("says where the asset stands", () => {
    const of = (
      status: "active" | "sold",
      handoverStatus: "pending" | "accepted" | null,
      holder = company,
    ) => assetDisplayStatus({ status, handoverStatus, holder });
    expect(of("active", null)).toBe("available");
    expect(of("active", "pending", anna)).toBe("awaitingSignature");
    expect(of("active", "accepted", anna)).toBe("handedOver");
    expect(
      of("active", null, assetHolderFrom({ type: "external", name: "Erik" })),
    ).toBe("outside");
    expect(of("sold", null, anna)).toBe("sold");
  });
});

describe("removing assets", () => {
  it("is only possible while nobody holds the asset on a receipt", () => {
    expect(canDeleteAsset(state())).toBe(true);
    expect(canDeleteAsset(state({ status: "sold" }))).toBe(true);
    expect(
      canDeleteAsset(
        state({ activeHandoverId: "h1", handoverStatus: "pending" }),
      ),
    ).toBe(false);
    expect(
      canDeleteAsset(
        state({ activeHandoverId: "h1", handoverStatus: "accepted" }),
      ),
    ).toBe(false);
  });
});

describe("equipment expenses", () => {
  const category = (code: string, en: string, sv: string) => ({
    code,
    name: { en, sv },
    direction: "expense" as const,
  });

  it("recognises equipment categories by code or name in either language", () => {
    expect(
      isAssetExpenseCategory(category("5410", "Equipment", "Utrustning")),
    ).toBe(true);
    expect(isAssetExpenseCategory(category("equipment", "", ""))).toBe(true);
    expect(
      isAssetExpenseCategory(
        category("5410", "Office equipment", "Kontorsutrustning"),
      ),
    ).toBe(true);
    expect(isAssetExpenseCategory(category("6200", "Travel", "Resor"))).toBe(
      false,
    );
    expect(
      isAssetExpenseCategory({
        ...category("x", "Equipment", "Utrustning"),
        direction: "income",
      }),
    ).toBe(false);
    expect(isAssetExpenseCategory(undefined)).toBe(false);
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
    parts: JSON.stringify([{ name: "Mobile phone", priceMinor: 1_299_900 }]),
    vatRateBps: "2500",
    purchaseDate: "",
  };

  it("accepts equipment and leaves out an empty date", () => {
    const parsed = assetFormSchema.parse(form);
    expect(parsed.parts[0]?.priceMinor).toBe(1_299_900);
    expect(parsed.otherCostsMinor).toBe(0);
    expect(parsed.purchaseDate).toBeNull();
    expect(parsed.inUseBy).toBe("");
    expect(parsed.purchaseTransactionId).toBeNull();
    expect(
      assetFormSchema.parse({ ...form, purchaseTransactionId: "t1" })
        .purchaseTransactionId,
    ).toBe("t1");
  });

  it("rejects unknown categories, fractions of öre and odd VAT", () => {
    expect(
      assetFormSchema.safeParse({ ...form, category: "car" }).success,
    ).toBe(false);
    expect(
      assetFormSchema.safeParse({ ...form, otherCostsMinor: "1.5" }).success,
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
    ).toBe(false);
    expect(
      handoverActionSchema.safeParse({
        action: "accept",
        place: "Gothenburg",
        confirm: true,
        signature: { method: "typed", image: "data:image/png;base64,AAAA" },
      }).success,
    ).toBe(true);
    expect(
      handoverActionSchema.safeParse({
        action: "accept",
        place: "Gothenburg",
        confirm: true,
        signature: { method: "typed", image: "data:image/jpeg;base64,AAAA" },
      }).success,
    ).toBe(false);
  });
});

/** An 8-bit RGBA PNG whose rows use each filter in turn, as browsers do. */
function rgbaPng(
  width: number,
  height: number,
  alphaAt: (x: number, y: number) => number,
) {
  const chunk = (type: string, body: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    // The checksum is not checked by the reader, so zeros will do.
    return Buffer.concat([
      length,
      Buffer.from(type, "latin1"),
      body,
      Buffer.alloc(4),
    ]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const stride = width * 4;
  const rows: Buffer[] = [];
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const line = Buffer.alloc(stride);
    for (let x = 0; x < width; x += 1) {
      line.set([31, 42, 68, alphaAt(x, y)], x * 4);
    }
    const filter = y % 5;
    const filtered = Buffer.alloc(stride);
    for (let i = 0; i < stride; i += 1) {
      const left = i >= 4 ? line[i - 4]! : 0;
      const up = previous[i]!;
      const upLeft = i >= 4 ? previous[i - 4]! : 0;
      const p = left + up - upLeft;
      const paeth =
        Math.abs(p - left) <= Math.abs(p - up) &&
        Math.abs(p - left) <= Math.abs(p - upLeft)
          ? left
          : Math.abs(p - up) <= Math.abs(p - upLeft)
            ? up
            : upLeft;
      const predicted = [0, left, up, (left + up) >> 1, paeth][filter]!;
      filtered[i] = (line[i]! - predicted) & 0xff;
    }
    rows.push(Buffer.from([filter]), filtered);
    previous = line;
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("signature images", () => {
  const stripe = (x: number, y: number) =>
    y >= 4 && y < 8 ? 255 : (x * 7) % 64;
  const limits = { maxWidth: 1200, maxHeight: 400 };

  it("reads the ink of a canvas PNG whatever filter each row uses", () => {
    const image = pngAlpha(rgbaPng(30, 12, stripe), limits);
    expect(image.width).toBe(30);
    expect(image.height).toBe(12);
    for (let y = 0; y < 12; y += 1)
      for (let x = 0; x < 30; x += 1)
        expect(image.alpha[y * 30 + x]).toBe(stripe(x, y));
    expect(hasSignatureInk(image.alpha)).toBe(true);
  });

  it("refuses blank, oversized and non-PNG images", () => {
    expect(
      hasSignatureInk(
        pngAlpha(
          rgbaPng(30, 12, () => 0),
          limits,
        ).alpha,
      ),
    ).toBe(false);
    expect(() =>
      pngAlpha(rgbaPng(30, 12, stripe), { maxWidth: 20, maxHeight: 400 }),
    ).toThrow();
    expect(() =>
      pngAlpha(Buffer.from("not a png at all, just some text"), limits),
    ).toThrow();
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
      signature: { width: 2, height: 1, alpha: Buffer.from([255, 0]) },
      labels,
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const text = pdfTextOf(pdf);
    expect(text).toContain("353373064");
    expect(text).toContain("Debageri AB");
    expect(text).toContain("19900101-1234");
    expect(text).toContain("2026-08-21 Gothenburg");
    expect(text).toContain("Accepted electronically by Anna");
    expect(text).toContain("/Im1 Do");
    expect(pdf.toString("latin1")).toContain("/SMask");
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
        signature: null,
        labels,
      }),
    );
    expect(text).not.toContain(en.assetReceiptPersonalNumber);
    expect(text).toContain(en.assetReceiptNotYetAccepted);
    expect(text).toContain("SN39");
  });
});
