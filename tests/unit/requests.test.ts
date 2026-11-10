import { describe, expect, it } from "vitest";
import {
  togglePermission,
  type PermissionKey,
} from "@/domain/access/permissions";
import {
  buildNotification,
  notificationValuesFor,
} from "@/domain/notifications";
import {
  canBecomeExpense,
  canTransition,
  filterRequests,
  isEditableRequest,
  isSafeLink,
  nextStatuses,
  REQUEST_STATUSES,
  requestTypesFor,
} from "@/domain/requests";
import { transactionSchema } from "@/server/validators/finance";
import {
  parseRequestForm,
  requestStatusSchema,
} from "@/server/validators/requests";
import { rolePermissions } from "./role-permissions";

describe("request statuses", () => {
  it("lets reviewers move a request forward and reopen a rejection", () => {
    expect(nextStatuses("requested", "reviewer")).toEqual([
      "under_review",
      "accepted",
      "rejected",
    ]);
    expect(nextStatuses("under_review", "reviewer")).toEqual([
      "accepted",
      "rejected",
    ]);
    expect(nextStatuses("accepted", "reviewer")).toEqual([
      "finalized",
      "rejected",
    ]);
    expect(nextStatuses("rejected", "reviewer")).toEqual(["under_review"]);
  });

  it("closes finalized and withdrawn requests for everyone", () => {
    for (const actor of ["reviewer", "owner"] as const) {
      expect(nextStatuses("finalized", actor)).toEqual([]);
      expect(nextStatuses("withdrawn", actor)).toEqual([]);
    }
  });

  it("only lets the requester withdraw a request nobody picked up", () => {
    expect(canTransition("requested", "withdrawn", "owner")).toBe(true);
    for (const status of REQUEST_STATUSES.filter((s) => s !== "requested"))
      expect(canTransition(status, "withdrawn", "owner")).toBe(false);
    expect(canTransition("requested", "accepted", "owner")).toBe(false);
    expect(canTransition("requested", "withdrawn", "reviewer")).toBe(false);
  });

  it("never skips straight from requested to finalized", () => {
    expect(canTransition("requested", "finalized", "reviewer")).toBe(false);
    expect(canTransition("under_review", "finalized", "reviewer")).toBe(false);
  });

  it("can only be edited while requested", () => {
    expect(isEditableRequest({ status: "requested" })).toBe(true);
    expect(isEditableRequest({ status: "under_review" })).toBe(false);
  });

  it("turns only finalized, unbooked requests into expenses", () => {
    expect(
      canBecomeExpense({ status: "finalized", expenseTransactionId: null }),
    ).toBe(true);
    expect(
      canBecomeExpense({ status: "finalized", expenseTransactionId: "tx" }),
    ).toBe(false);
    expect(
      canBecomeExpense({ status: "accepted", expenseTransactionId: null }),
    ).toBe(false);
  });
});

describe("request types per permission", () => {
  it("offers only the types the profile allows", () => {
    expect(
      requestTypesFor({
        permissions: [
          "my.requests",
          "my.requests.equipment",
          "my.requests.education",
        ],
      }),
    ).toEqual(["equipment", "education"]);
    expect(
      requestTypesFor({ permissions: rolePermissions("consultant") }),
    ).toEqual(["equipment", "education", "seminar", "travel"]);
    expect(requestTypesFor({ permissions: rolePermissions("admin") })).toEqual(
      [],
    );
  });

  it("clears every type when My requests is unticked", () => {
    const selected: PermissionKey[] = [
      "my.requests",
      "my.requests.equipment",
      "my.requests.seminar",
    ];
    expect(
      togglePermission(selected, "my.requests", false, "consultant"),
    ).toEqual([]);
    expect(
      togglePermission([], "my.requests.travel", true, "consultant"),
    ).toEqual(["my.requests", "my.requests.travel"]);
  });

  it("lets office staff hold request types too", () => {
    expect(
      togglePermission([], "my.requests.education", true, "staff"),
    ).toEqual(["my.requests", "my.requests.education"]);
  });
});

describe("filterRequests", () => {
  const items = [
    {
      id: "a",
      submittedOn: "2026-11-02",
      status: "requested" as const,
      type: "equipment" as const,
      userId: "u1",
    },
    {
      id: "b",
      submittedOn: "2026-10-15",
      status: "accepted" as const,
      type: "seminar" as const,
      userId: "u2",
    },
  ];

  it("filters on period, status, type and person", () => {
    const all = { period: null, status: "all", type: "all" } as const;
    expect(filterRequests(items, all).map((item) => item.id)).toEqual([
      "a",
      "b",
    ]);
    expect(
      filterRequests(items, { ...all, period: "2026-11" }).map((i) => i.id),
    ).toEqual(["a"]);
    expect(
      filterRequests(items, { ...all, period: "2026" }).map((i) => i.id),
    ).toEqual(["a", "b"]);
    expect(
      filterRequests(items, { ...all, type: "seminar" }).map((i) => i.id),
    ).toEqual(["b"]);
    expect(
      filterRequests(items, { ...all, status: "requested" }).map((i) => i.id),
    ).toEqual(["a"]);
    expect(
      filterRequests(items, { ...all, userId: "u2" }).map((i) => i.id),
    ).toEqual(["b"]);
  });
});

function form(values: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values))
    for (const item of Array.isArray(value) ? value : [value])
      data.append(key, item);
  return data;
}

describe("request form", () => {
  const valid = {
    type: "education",
    title: "Kubernetes course",
    description: "Online",
    links: ["https://example.com/course", ""],
    estimatedCostMinor: "450000",
    payer: "company",
    startDate: "2026-12-01",
    endDate: "2026-12-03",
  };

  it("accepts a complete request and drops empty links", () => {
    const parsed = parseRequestForm(form(valid));
    expect(parsed.success).toBe(true);
    expect(parsed.data?.links).toEqual(["https://example.com/course"]);
    expect(parsed.data?.startDate).toBe("2026-12-01");
    expect(parsed.data?.keepFileIds).toEqual([]);
  });

  it("drops dates for equipment", () => {
    const parsed = parseRequestForm(form({ ...valid, type: "equipment" }));
    expect(parsed.data?.startDate).toBeNull();
    expect(parsed.data?.endDate).toBeNull();
  });

  it("rejects script links, unknown types and payers, and reversed dates", () => {
    expect(
      parseRequestForm(form({ ...valid, links: ["javascript:alert(1)"] }))
        .success,
    ).toBe(false);
    expect(parseRequestForm(form({ ...valid, type: "car" })).success).toBe(
      false,
    );
    expect(parseRequestForm(form({ ...valid, payer: "client" })).success).toBe(
      false,
    );
    expect(
      parseRequestForm(form({ ...valid, endDate: "2026-11-30" })).success,
    ).toBe(false);
    expect(
      parseRequestForm(form({ ...valid, estimatedCostMinor: "12.5" })).success,
    ).toBe(false);
  });

  it("allows at most five links", () => {
    const links = Array.from({ length: 6 }, (_, i) => `https://e.com/${i}`);
    expect(parseRequestForm(form({ ...valid, links })).success).toBe(false);
  });

  it("only treats http and https as links", () => {
    expect(isSafeLink("https://example.com")).toBe(true);
    expect(isSafeLink("http://example.com")).toBe(true);
    expect(isSafeLink("ftp://example.com")).toBe(false);
    expect(isSafeLink("example.com")).toBe(false);
  });

  it("needs a note to reject", () => {
    expect(
      requestStatusSchema.safeParse({ status: "rejected", note: "" }).success,
    ).toBe(false);
    expect(
      requestStatusSchema.safeParse({ status: "rejected", note: "No budget" })
        .success,
    ).toBe(true);
    expect(requestStatusSchema.safeParse({ status: "accepted" }).success).toBe(
      true,
    );
  });
});

describe("expense from a request", () => {
  it("accepts a requestId on a new transaction", () => {
    const parsed = transactionSchema.parse({
      action: "createTransaction",
      direction: "expense",
      categoryId: "cat",
      consultantId: "u1",
      date: "2026-11-10",
      amountMode: "gross",
      amountMinor: 450_000,
      roundingMinor: 0,
      vatRateBps: 2_500,
      funding: "company",
      requestId: "req-1",
    });
    expect(parsed.requestId).toBe("req-1");
    expect(parsed.receiptId).toBeNull();
  });
});

describe("request notifications", () => {
  it("names the type and status in the reader's language", () => {
    const params = {
      personName: "Cleo",
      requestTitle: "Course",
      requestType: "education",
      requestStatus: "under_review",
      amountMinor: 450_000,
      comment: "",
    };
    const sv = buildNotification("requestStatusChanged", "sv-SE", {
      ...notificationValuesFor(params, "sv-SE"),
      recipientName: "Cleo",
      organizationName: "Debageri",
      link: "https://portal/requests",
    });
    expect(sv.text).toContain("utbildning");
    expect(sv.text).toContain("under granskning");
    const en = buildNotification("requestSubmitted", "en-SE", {
      ...notificationValuesFor(params, "en-SE"),
      recipientName: "Ann",
      organizationName: "Debageri",
      link: "https://portal/requests",
    });
    expect(en.subject).toBe("New education request: Course");
    expect(en.text).toContain("Cleo");
  });
});
