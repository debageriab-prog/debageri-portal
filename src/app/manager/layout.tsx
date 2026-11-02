import { PortalShell } from "@/components/layout/PortalShell";
import { can } from "@/domain/access/permissions";
import { redirect } from "next/navigation";
import { verifySession } from "@/server/auth/session";
export default async function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await verifySession();
  if (!user) redirect("/auth/login");
  if (!can(user, "time.approvals.review")) redirect("/unauthorized");
  return <PortalShell user={user}>{children}</PortalShell>;
}
