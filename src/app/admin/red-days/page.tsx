import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { RedDayManagement } from "./RedDayManagement";

export default async function RedDaysPage() {
  const actor = (await verifySession())!;
  const { db } = getAdminServices();
  const snapshot = await db
    .collection("holidays")
    .where("organizationId", "==", actor.organizationId)
    .get();
  const days = snapshot.docs
    .map((doc) => ({
      id: doc.id,
      date: String(doc.data().date),
      name: String(doc.data().name),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <RedDayManagement days={days} initialYear={new Date().getUTCFullYear()} />
  );
}
