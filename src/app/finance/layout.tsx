import { redirect } from "next/navigation";
import { PortalShell } from "@/components/layout/PortalShell";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";

export default async function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await verifySession();
  if (!user) redirect("/auth/login");
  const { db } = getAdminServices();
  const organization = await db
    .collection("organizations")
    .doc(user.organizationId)
    .get();
  const allowedManager = ["admin", "accountant"].includes(user.role);
  const allowedConsultant =
    user.role === "consultant" && user.compensationModel === "flexible";
  if (
    (!organization.data()?.financeEnabled && !allowedManager) ||
    (!allowedManager && !allowedConsultant)
  )
    redirect("/unauthorized");
  return <PortalShell user={user}>{children}</PortalShell>;
}
