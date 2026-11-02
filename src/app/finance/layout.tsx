import { redirect } from "next/navigation";
import { PortalShell } from "@/components/layout/PortalShell";
import { can, hasOrganizationFinance } from "@/domain/access/permissions";
import { canViewMyFinance } from "@/domain/finance/calculations";
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
  const allowedManager = hasOrganizationFinance(user);
  const allowedConsultant = canViewMyFinance(user) || can(user, "my.invoices");
  if (
    (!organization.data()?.financeEnabled && !allowedManager) ||
    (!allowedManager && !allowedConsultant)
  )
    redirect("/unauthorized");
  return <PortalShell user={user}>{children}</PortalShell>;
}
