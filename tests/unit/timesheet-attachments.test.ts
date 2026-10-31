import { describe, expect, it } from "vitest";
import {
  TIMESHEET_ATTACHMENT_MAX_BYTES,
  timesheetAttachmentAccess,
  timesheetAttachmentFileError,
} from "@/domain/timesheets/attachments";
import type { UserRole } from "@/domain/types";
import { timesheetAttachmentRemovalSchema } from "@/server/validators/timesheet-attachments";

const actor = (id: string, role: UserRole, organizationId = "debageri") => ({
  id,
  role,
  organizationId,
});
const owner = (role: UserRole, reportsTime = true) => ({
  role,
  reportsTime,
  organizationId: "debageri",
});

describe("timesheet attachment access", () => {
  it("lets the reporter add and view but never remove", () => {
    expect(
      timesheetAttachmentAccess(
        actor("u1", "consultant"),
        "u1",
        owner("consultant"),
      ),
    ).toEqual({ canAdd: true, canRemove: false, canView: true });
  });

  it("lets managers and admins view and remove but not add", () => {
    for (const role of ["manager", "admin"] as const)
      expect(
        timesheetAttachmentAccess(actor("m1", role), "u1", owner("consultant")),
      ).toEqual({ canAdd: false, canRemove: true, canView: true });
  });

  it("leaves a manager's own report to an admin", () => {
    expect(
      timesheetAttachmentAccess(actor("m1", "manager"), "m1", owner("manager"))
        .canRemove,
    ).toBe(false);
    expect(
      timesheetAttachmentAccess(actor("m2", "manager"), "m1", owner("manager")),
    ).toEqual({ canAdd: false, canRemove: false, canView: false });
    expect(
      timesheetAttachmentAccess(actor("a1", "admin"), "m1", owner("manager")),
    ).toEqual({ canAdd: false, canRemove: true, canView: true });
  });

  it("gives accountants read access to consultant reports only", () => {
    expect(
      timesheetAttachmentAccess(
        actor("f1", "accountant"),
        "u1",
        owner("consultant"),
      ),
    ).toEqual({ canAdd: false, canRemove: false, canView: true });
    expect(
      timesheetAttachmentAccess(
        actor("f1", "accountant"),
        "m1",
        owner("manager"),
      ).canView,
    ).toBe(false);
  });

  it("blocks other consultants and other organizations", () => {
    expect(
      timesheetAttachmentAccess(
        actor("u2", "consultant"),
        "u1",
        owner("consultant"),
      ).canView,
    ).toBe(false);
    for (const role of ["manager", "admin", "accountant"] as const)
      expect(
        timesheetAttachmentAccess(
          actor("x1", role, "other"),
          "u1",
          owner("consultant"),
        ),
      ).toEqual({ canAdd: false, canRemove: false, canView: false });
  });
});

describe("timesheet attachment files", () => {
  it("accepts PDFs and images up to the size limit", () => {
    for (const type of [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ])
      expect(
        timesheetAttachmentFileError({
          size: TIMESHEET_ATTACHMENT_MAX_BYTES,
          type,
        }),
      ).toBeNull();
  });

  it("rejects empty, oversized and other file types", () => {
    const type = "application/pdf";
    expect(timesheetAttachmentFileError({ size: 0, type })).toBe(
      "attachmentRequired",
    );
    expect(
      timesheetAttachmentFileError({
        size: TIMESHEET_ATTACHMENT_MAX_BYTES + 1,
        type,
      }),
    ).toBe("attachmentTooLarge");
    expect(
      timesheetAttachmentFileError({ size: 10, type: "image/svg+xml" }),
    ).toBe("attachmentType");
    expect(timesheetAttachmentFileError({ size: 10, type: "" })).toBe(
      "attachmentType",
    );
  });
});

describe("timesheet attachment removal", () => {
  it("requires the exact confirmation phrase", () => {
    const accepts = (confirmation: unknown) =>
      timesheetAttachmentRemovalSchema.safeParse({ confirmation }).success;
    expect(accepts("I am sure")).toBe(true);
    expect(accepts("i am sure")).toBe(false);
    expect(accepts("")).toBe(false);
    expect(accepts(undefined)).toBe(false);
  });
});
