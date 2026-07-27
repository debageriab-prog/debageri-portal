import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { UserManagement } from "./UserManagement";

export default async function UsersPage() {
  const actor = (await verifySession())!;
  const { db } = getAdminServices();
  const [snapshot, termsSnapshot] = await Promise.all([
    db
      .collection("users")
      .where("organizationId", "==", actor.organizationId)
      .get(),
    db
      .collection("employmentTerms")
      .where("organizationId", "==", actor.organizationId)
      .get(),
  ]);
  const terms = new Map<string, Record<string, unknown>>();
  termsSnapshot.docs
    .sort((a, b) =>
      String(a.data().validFrom).localeCompare(String(b.data().validFrom)),
    )
    .forEach((doc) => terms.set(String(doc.data().userId), doc.data()));
  const users = snapshot.docs
    .map((doc) => {
      const data = doc.data();
      const term = terms.get(doc.id);
      return {
        id: doc.id,
        displayName: String(data.displayName),
        email: String(data.email),
        employeeNumber: String(data.employeeNumber),
        role: String(data.role),
        reportsTime:
          data.reportsTime ??
          ["employee", "consultant"].includes(String(data.role)),
        status: String(data.status),
        createdAt: data.createdAt?.toMillis?.() ?? 0,
        employmentStartDate: String(
          term?.validFrom ?? data.employmentStartDate ?? "",
        ),
        employmentEndDate: term?.validTo ? String(term.validTo) : "",
        reportingStartDate: String(
          term?.reportingStartDate ?? term?.validFrom ?? "",
        ),
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  return <UserManagement users={users} currentUserId={actor.id} />;
}
