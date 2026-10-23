import { parsePayslipPeriod } from "@/domain/payslips";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import {
  canManagePayslips,
  payslipVisible,
} from "@/server/services/payslip-service";
import { PayslipManagement } from "./PayslipManagement";
import type { PayslipItem } from "./PayslipPreview";
import { PayslipViewer } from "./PayslipViewer";

function toItem(doc: FirebaseFirestore.QueryDocumentSnapshot): PayslipItem {
  const data = doc.data();
  return {
    id: doc.id,
    userId: String(data.userId),
    userName: String(data.userName),
    period: String(data.period),
    year: Number(data.year),
    month: Number(data.month),
    fileName: String(data.fileName),
    contentType: String(data.contentType),
    uploadedAt: data.createdAt?.toDate?.().toISOString().slice(0, 10) ?? "",
  };
}

export default async function PayslipsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; period?: string; year?: string }>;
}) {
  const actor = (await verifySession())!;
  const { db } = getAdminServices();
  const currentPeriod = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  if (!canManagePayslips(actor)) {
    const snapshot = await db
      .collection("payslips")
      .where("organizationId", "==", actor.organizationId)
      .where("userId", "==", actor.id)
      .get();
    const payslips = snapshot.docs
      .filter((doc) => payslipVisible(actor, doc.data()))
      .map(toItem)
      .sort((a, b) => b.period.localeCompare(a.period));
    return <PayslipViewer payslips={payslips} currentPeriod={currentPeriod} />;
  }
  const params = await searchParams;
  const view = params.view === "year" ? "year" : "month";
  const period = parsePayslipPeriod(params.period ?? "")
    ? params.period!
    : currentPeriod;
  const requestedYear = Number(params.year);
  const year =
    Number.isInteger(requestedYear) &&
    requestedYear >= 2000 &&
    requestedYear <= 2100
      ? requestedYear
      : Number(period.slice(0, 4));
  const scoped = db
    .collection("payslips")
    .where("organizationId", "==", actor.organizationId);
  const [snapshot, users] = await Promise.all([
    view === "year"
      ? scoped.where("year", "==", year).get()
      : scoped.where("period", "==", period).get(),
    db
      .collection("users")
      .where("organizationId", "==", actor.organizationId)
      .where("role", "in", ["employee", "consultant", "manager"])
      .get(),
  ]);
  const payslips = snapshot.docs
    .map(toItem)
    .sort(
      (a, b) =>
        b.period.localeCompare(a.period) ||
        a.userName.localeCompare(b.userName),
    );
  const people = new Map(
    users.docs.map((doc) => [
      doc.id,
      {
        name: String(doc.data().displayName),
        employeeNumber: String(doc.data().employeeNumber ?? ""),
      },
    ]),
  );
  for (const item of payslips)
    if (!people.has(item.userId))
      people.set(item.userId, { name: item.userName, employeeNumber: "" });
  return (
    <PayslipManagement
      payslips={payslips}
      view={view}
      period={period}
      year={year}
      people={Array.from(people, ([id, person]) => ({ id, ...person })).sort(
        (a, b) => a.name.localeCompare(b.name),
      )}
    />
  );
}
