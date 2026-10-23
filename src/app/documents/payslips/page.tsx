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
  searchParams: Promise<{ period?: string }>;
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
  const requested = (await searchParams).period ?? "";
  const period = parsePayslipPeriod(requested) ? requested : currentPeriod;
  const snapshot = await db
    .collection("payslips")
    .where("organizationId", "==", actor.organizationId)
    .where("period", "==", period)
    .get();
  const payslips = snapshot.docs
    .map(toItem)
    .sort((a, b) => a.userName.localeCompare(b.userName));
  return <PayslipManagement payslips={payslips} period={period} />;
}
