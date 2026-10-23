import { redirect } from "next/navigation";
import { PortalShell } from "@/components/layout/PortalShell";
import { verifySession } from "@/server/auth/session";
import { canReadContracts } from "@/server/services/contract-service";
import { canReadPayslips } from "@/server/services/payslip-service";

export default async function DocumentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await verifySession();
  if (!user) redirect("/auth/login");
  if (!canReadContracts(user) && !canReadPayslips(user))
    redirect("/unauthorized");
  return <PortalShell user={user}>{children}</PortalShell>;
}
