import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  actor: {
    id: "consultant-1",
    organizationId: "org-1",
    role: "consultant",
    financeAccess: { myInvoices: true, myFinance: false },
  },
  invoice: { organizationId: "org-1", consultantId: "consultant-1" },
  file: {
    organizationId: "org-1",
    entityType: "invoice",
    entityId: "invoice-1",
    name: "invoice.pdf",
    contentType: "application/pdf",
    storagePath: "invoices/file",
  },
  download: vi.fn(async () => [Buffer.from("invoice contents")]),
  save: vi.fn(),
  deleteFile: vi.fn(),
}));
vi.mock("@/server/auth/session", () => ({
  verifySession: async () => state.actor,
}));
vi.mock("@/lib/firebase/admin", () => ({
  getAdminServices: () => ({
    db: {
      collection: (name: string) => ({
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => (name === "invoices" ? state.invoice : state.file),
          }),
        }),
        where: () => ({
          where: () => ({
            where: () => ({
              get: async () => ({
                docs: [
                  { id: "file-1", data: () => ({ ...state.file, size: 16 }) },
                ],
              }),
            }),
          }),
        }),
      }),
    },
    storage: {
      bucket: () => ({
        file: () => ({
          download: state.download,
          save: state.save,
          delete: state.deleteFile,
        }),
      }),
    },
  }),
}));
import {
  GET as list,
  POST as upload,
} from "@/app/api/finance/attachments/[entityType]/[entityId]/route";
import {
  GET as download,
  DELETE as remove,
} from "@/app/api/finance/attachments/[entityType]/[entityId]/[attachmentId]/route";
const params = {
  entityType: "invoice",
  entityId: "invoice-1",
  attachmentId: "file-1",
};
const request = new Request(
  "http://localhost/api/finance/attachments/invoice/invoice-1",
);

describe("invoice attachment authorization", () => {
  beforeEach(() => {
    state.actor.role = "consultant";
    state.actor.financeAccess.myInvoices = true;
    state.invoice.organizationId = "org-1";
    state.invoice.consultantId = "consultant-1";
    state.file.entityId = "invoice-1";
    vi.clearAllMocks();
  });
  it("lists and downloads own invoices with invoice access alone", async () => {
    const response = await list(request, { params: Promise.resolve(params) });
    expect(response!.status).toBe(200);
    expect((await response!.json()).attachments[0].name).toBe("invoice.pdf");
    const file = await download(request, { params: Promise.resolve(params) });
    expect(file!.status).toBe(200);
    expect(await file!.text()).toBe("invoice contents");
    expect(file!.headers.get("Content-Disposition")).toContain("invoice.pdf");
  });
  it("blocks consultants without invoice access", async () => {
    state.actor.financeAccess.myInvoices = false;
    expect(
      (await list(request, { params: Promise.resolve(params) }))!.status,
    ).toBe(403);
    expect(
      (await download(request, { params: Promise.resolve(params) }))!.status,
    ).toBe(403);
    expect(state.download).not.toHaveBeenCalled();
  });
  it("blocks another consultant's invoice", async () => {
    state.invoice.consultantId = "consultant-2";
    expect(
      (await download(request, { params: Promise.resolve(params) }))!.status,
    ).toBe(403);
  });
  it("blocks cross-organization invoices and mismatched attachments", async () => {
    state.invoice.organizationId = "org-2";
    expect(
      (await download(request, { params: Promise.resolve(params) }))!.status,
    ).toBe(404);
    state.invoice.organizationId = "org-1";
    state.file.entityId = "invoice-2";
    expect(
      (await download(request, { params: Promise.resolve(params) }))!.status,
    ).toBe(404);
  });
  it("blocks consultant uploads and removals", async () => {
    expect(
      (await upload(request, { params: Promise.resolve(params) }))!.status,
    ).toBe(403);
    expect(
      (await remove(request, { params: Promise.resolve(params) }))!.status,
    ).toBe(403);
    expect(state.save).not.toHaveBeenCalled();
    expect(state.deleteFile).not.toHaveBeenCalled();
  });
  it.each(["admin", "accountant"])(
    "allows %s to download company invoices",
    async (role) => {
      state.actor.role = role;
      state.invoice.consultantId = "";
      expect(
        (await download(request, { params: Promise.resolve(params) }))!.status,
      ).toBe(200);
    },
  );
});
