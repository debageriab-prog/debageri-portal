import { PortalShell } from "@/components/layout/PortalShell";
import { redirect } from "next/navigation";
import { canReportTime, canViewOwnHistory } from "@/domain/access/permissions";
import { verifySession } from "@/server/auth/session";
export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await verifySession();
  if (!user) redirect("/auth/login");
  if (!canReportTime(user) && !canViewOwnHistory(user)) redirect("/");
  return <PortalShell user={user}>{children}</PortalShell>;
}
