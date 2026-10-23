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
  searchParams: Promise<{ year?: string }>;
}) {
  const actor = (await verifySession())!;
  const { db } = getAdminServices();
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
    return <PayslipViewer payslips={payslips} />;
  }
  const currentYear = new Date().getFullYear();
  const requested = Number((await searchParams).year);
  const year =
    Number.isInteger(requested) && requested >= 2000 && requested <= 2100
      ? requested
      : currentYear;
  const snapshot = await db
    .collection("payslips")
    .where("organizationId", "==", actor.organizationId)
    .where("year", "==", year)
    .get();
  const payslips = snapshot.docs
    .map(toItem)
    .sort(
      (a, b) =>
        b.period.localeCompare(a.period) ||
        a.userName.localeCompare(b.userName),
    );
  const years = Array.from(
    new Set([
      currentYear + 1,
      currentYear,
      year,
      currentYear - 1,
      currentYear - 2,
    ]),
  ).sort((a, b) => b - a);
  return <PayslipManagement payslips={payslips} year={year} years={years} />;
}
