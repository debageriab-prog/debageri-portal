import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { financeIsEnabled } from "@/server/services/finance-service";
import {
  canBookRequests,
  canReviewRequests,
  canSubmitRequests,
  canViewOwnRequests,
  REQUESTER_ROLES,
  requestVisible,
} from "@/server/services/request-service";
import { MyRequests } from "./MyRequests";
import type { RequestItem } from "./RequestParts";
import { RequestReview } from "./RequestReview";
import { historyByRequest, newestFirst, toRequestItem } from "./request-data";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; saved?: string; mine?: string }>;
}) {
  const actor = (await verifySession())!;
  const { db } = getAdminServices();
  const currentPeriod = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  const params = await searchParams;
  const requests = db
    .collection("requests")
    .where("organizationId", "==", actor.organizationId);
  const events = db
    .collection("requestEvents")
    .where("organizationId", "==", actor.organizationId);
  if (
    !canReviewRequests(actor) ||
    (params.mine === "1" && canViewOwnRequests(actor))
  ) {
    const [snapshot, eventSnapshot] = await Promise.all([
      requests.where("userId", "==", actor.id).get(),
      events.where("userId", "==", actor.id).get(),
    ]);
    const history = historyByRequest(eventSnapshot.docs);
    const items = snapshot.docs
      .filter((doc) => requestVisible(actor, doc.data()))
      .map((doc) => toRequestItem(doc, history))
      .filter((item): item is RequestItem => item !== null)
      .sort(newestFirst);
    return (
      <MyRequests
        requests={items}
        currentPeriod={currentPeriod}
        notice={
          params.submitted === "1"
            ? "submitted"
            : params.saved === "1"
              ? "saved"
              : null
        }
        canSubmit={canSubmitRequests(actor)}
      />
    );
  }
  const [snapshot, eventSnapshot, users, financeEnabled] = await Promise.all([
    requests.get(),
    events.get(),
    db
      .collection("users")
      .where("organizationId", "==", actor.organizationId)
      .where("role", "in", REQUESTER_ROLES)
      .get(),
    financeIsEnabled(db, actor.organizationId),
  ]);
  const history = historyByRequest(eventSnapshot.docs);
  const items = snapshot.docs
    .map((doc) => toRequestItem(doc, history))
    .filter((item): item is RequestItem => item !== null)
    .sort(newestFirst);
  const people = new Map(
    users.docs.map((doc) => [
      doc.id,
      {
        name: String(doc.data().displayName),
        employeeNumber: String(doc.data().employeeNumber ?? ""),
      },
    ]),
  );
  for (const item of items)
    if (!people.has(item.userId))
      people.set(item.userId, {
        name: item.userName,
        employeeNumber: item.employeeNumber,
      });
  return (
    <RequestReview
      requests={items}
      currentPeriod={currentPeriod}
      actorId={actor.id}
      canBook={canBookRequests(actor) && financeEnabled}
      people={Array.from(people, ([id, person]) => ({ id, ...person })).sort(
        (a, b) => a.name.localeCompare(b.name),
      )}
    />
  );
}
