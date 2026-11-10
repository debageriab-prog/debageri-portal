import "server-only";

import {
  isRequestStatus,
  isRequestType,
  REQUEST_PAYERS,
  type RequestPayer,
} from "@/domain/requests";
import { storedRequestFiles } from "@/server/services/request-service";
import type { RequestHistoryItem, RequestItem } from "./RequestParts";

const iso = (value: unknown) =>
  (value as { toDate?: () => Date } | undefined)?.toDate?.().toISOString() ??
  "";

/** Groups status history by request, oldest change first. */
export function historyByRequest(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
) {
  const history = new Map<string, RequestHistoryItem[]>();
  for (const doc of docs) {
    const data = doc.data();
    if (!isRequestStatus(data.toStatus)) continue;
    const list = history.get(String(data.requestId)) ?? [];
    list.push({
      fromStatus: isRequestStatus(data.fromStatus) ? data.fromStatus : null,
      toStatus: data.toStatus,
      note: String(data.note ?? ""),
      performedByName: String(data.performedByName ?? ""),
      performedAt: iso(data.performedAt),
    });
    history.set(String(data.requestId), list);
  }
  for (const list of history.values())
    list.sort((a, b) => a.performedAt.localeCompare(b.performedAt));
  return history;
}

export function toRequestItem(
  doc: FirebaseFirestore.QueryDocumentSnapshot,
  history: Map<string, RequestHistoryItem[]>,
): RequestItem | null {
  const data = doc.data();
  if (!isRequestType(data.type)) return null;
  return {
    id: doc.id,
    userId: String(data.userId),
    userName: String(data.userName),
    employeeNumber: String(data.employeeNumber ?? ""),
    type: data.type,
    title: String(data.title),
    description: String(data.description ?? ""),
    links: Array.isArray(data.links) ? data.links.map(String) : [],
    estimatedCostMinor: Number(data.estimatedCostMinor ?? 0),
    payer: (REQUEST_PAYERS as readonly unknown[]).includes(data.payer)
      ? (data.payer as RequestPayer)
      : "company",
    startDate: data.startDate ? String(data.startDate) : null,
    endDate: data.endDate ? String(data.endDate) : null,
    files: storedRequestFiles(data.files).map(
      ({ id, name, contentType, size }) => ({ id, name, contentType, size }),
    ),
    status: isRequestStatus(data.status) ? data.status : "requested",
    reviewNote: String(data.reviewNote ?? ""),
    expenseTransactionId: data.expenseTransactionId
      ? String(data.expenseTransactionId)
      : null,
    submittedOn: String(data.submittedOn ?? iso(data.createdAt).slice(0, 10)),
    submittedAt: iso(data.createdAt),
    history: history.get(doc.id) ?? [],
  };
}

export const newestFirst = (a: RequestItem, b: RequestItem) =>
  b.submittedAt.localeCompare(a.submittedAt);
