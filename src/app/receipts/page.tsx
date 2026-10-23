import { getAdminServices } from "@/lib/firebase/admin";
import { isReceiptStatus } from "@/domain/receipts";
import { verifySession } from "@/server/auth/session";
import {
  canReviewReceipts,
  receiptVisible,
} from "@/server/services/receipt-service";
import { MyReceipts } from "./MyReceipts";
import type { ReceiptItem } from "./ReceiptParts";
import { ReceiptReview } from "./ReceiptReview";

function toItem(doc: FirebaseFirestore.QueryDocumentSnapshot): ReceiptItem {
  const data = doc.data();
  return {
    id: doc.id,
    userId: String(data.userId),
    userName: String(data.userName),
    employeeNumber: String(data.employeeNumber ?? ""),
    date: String(data.date),
    name: String(data.name),
    description: String(data.description ?? ""),
    netMinor: Number(data.netMinor ?? 0),
    vatMinor: Number(data.vatMinor ?? 0),
    fileName: String(data.fileName),
    contentType: String(data.contentType),
    status: isReceiptStatus(data.status) ? data.status : "pending",
    reviewNote: String(data.reviewNote ?? ""),
    expenseTransactionId: data.expenseTransactionId
      ? String(data.expenseTransactionId)
      : null,
    submittedAt: data.createdAt?.toDate?.().toISOString() ?? "",
  };
}

const newestFirst = (a: ReceiptItem, b: ReceiptItem) =>
  b.date.localeCompare(a.date) || b.submittedAt.localeCompare(a.submittedAt);

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const actor = (await verifySession())!;
  const { db } = getAdminServices();
  const currentPeriod = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  const scoped = db
    .collection("receipts")
    .where("organizationId", "==", actor.organizationId);
  if (!canReviewReceipts(actor)) {
    const snapshot = await scoped.where("userId", "==", actor.id).get();
    const receipts = snapshot.docs
      .filter((doc) => receiptVisible(actor, doc.data()))
      .map(toItem)
      .sort(newestFirst);
    return (
      <MyReceipts
        receipts={receipts}
        currentPeriod={currentPeriod}
        submitted={(await searchParams).submitted === "1"}
      />
    );
  }
  const [snapshot, users] = await Promise.all([
    scoped.get(),
    db
      .collection("users")
      .where("organizationId", "==", actor.organizationId)
      .where("role", "in", ["employee", "consultant", "manager"])
      .get(),
  ]);
  const receipts = snapshot.docs.map(toItem).sort(newestFirst);
  const people = new Map(
    users.docs.map((doc) => [
      doc.id,
      {
        name: String(doc.data().displayName),
        employeeNumber: String(doc.data().employeeNumber ?? ""),
      },
    ]),
  );
  for (const item of receipts)
    if (!people.has(item.userId))
      people.set(item.userId, {
        name: item.userName,
        employeeNumber: item.employeeNumber,
      });
  return (
    <ReceiptReview
      receipts={receipts}
      currentPeriod={currentPeriod}
      people={Array.from(people, ([id, person]) => ({ id, ...person })).sort(
        (a, b) => a.name.localeCompare(b.name),
      )}
    />
  );
}
