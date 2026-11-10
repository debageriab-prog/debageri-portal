import type { PermissionKey } from "@/domain/access/permissions";

export const REQUEST_TYPES = [
  "equipment",
  "education",
  "seminar",
  "travel",
] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_STATUSES = [
  "requested",
  "under_review",
  "accepted",
  "rejected",
  "finalized",
  "withdrawn",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Who the requester expects to pay: the company or they themselves. */
export const REQUEST_PAYERS = ["company", "self"] as const;
export type RequestPayer = (typeof REQUEST_PAYERS)[number];

export const REQUEST_MAX_FILES = 5;
export const REQUEST_MAX_BYTES = 10 * 1024 * 1024;
export const REQUEST_MAX_LINKS = 5;
export const REQUEST_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** The permission that lets someone ask for each type of request. */
export const REQUEST_TYPE_PERMISSIONS = {
  equipment: "my.requests.equipment",
  education: "my.requests.education",
  seminar: "my.requests.seminar",
  travel: "my.requests.travel",
} as const satisfies Record<RequestType, PermissionKey>;

/** Types that are planned for a period of time and may carry dates. */
export const DATED_REQUEST_TYPES: readonly RequestType[] = [
  "education",
  "seminar",
  "travel",
];

export function isRequestType(value: unknown): value is RequestType {
  return (REQUEST_TYPES as readonly unknown[]).includes(value);
}

export function isRequestStatus(value: unknown): value is RequestStatus {
  return (REQUEST_STATUSES as readonly unknown[]).includes(value);
}

export function isRequestContentType(type: string) {
  return (REQUEST_CONTENT_TYPES as readonly string[]).includes(type);
}

/** The types this person may ask for, in menu order. */
export function requestTypesFor(user: {
  permissions: readonly PermissionKey[];
}): RequestType[] {
  return REQUEST_TYPES.filter((type) =>
    user.permissions.includes(REQUEST_TYPE_PERMISSIONS[type]),
  );
}

export type RequestActor = "reviewer" | "owner";

/**
 * Every allowed status change. Reviewers move a request forward or reject
 * it, and can reopen a rejection. The requester can only withdraw a request
 * nobody has picked up yet. Finalized and withdrawn requests are closed.
 */
export const REQUEST_TRANSITIONS: Record<
  RequestActor,
  Partial<Record<RequestStatus, readonly RequestStatus[]>>
> = {
  reviewer: {
    requested: ["under_review", "accepted", "rejected"],
    under_review: ["accepted", "rejected"],
    accepted: ["finalized", "rejected"],
    rejected: ["under_review"],
  },
  owner: {
    requested: ["withdrawn"],
  },
};

export function nextStatuses(
  from: RequestStatus,
  actor: RequestActor,
): readonly RequestStatus[] {
  return REQUEST_TRANSITIONS[actor][from] ?? [];
}

export function canTransition(
  from: RequestStatus,
  to: RequestStatus,
  actor: RequestActor,
) {
  return nextStatuses(from, actor).includes(to);
}

/** Only requests that nobody has picked up yet can be edited by the owner. */
export const isEditableRequest = (request: { status: RequestStatus }) =>
  request.status === "requested";

/** Finalized requests that are not booked yet can become an expense. */
export function canBecomeExpense(request: {
  status: RequestStatus;
  expenseTransactionId: string | null;
}) {
  return request.status === "finalized" && !request.expenseTransactionId;
}

export type RequestFilter = {
  period: string | null;
  status: RequestStatus | "all";
  type: RequestType | "all";
  userId?: string;
};

/** Filters on the day the request was sent (`YYYY-MM-DD`). */
export function filterRequests<
  T extends {
    submittedOn: string;
    status: RequestStatus;
    type: RequestType;
    userId: string;
  },
>(requests: T[], filter: RequestFilter) {
  return requests.filter(
    (request) =>
      (!filter.period || request.submittedOn.startsWith(`${filter.period}-`)) &&
      (filter.status === "all" || request.status === filter.status) &&
      (filter.type === "all" || request.type === filter.type) &&
      (!filter.userId || request.userId === filter.userId),
  );
}

/** Only plain web links are kept, so a stored link can never run script. */
export function isSafeLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
