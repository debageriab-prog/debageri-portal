import { redirect } from "next/navigation";
import { PortalShell } from "@/components/layout/PortalShell";
import { verifySession } from "@/server/auth/session";
import { canUseRequests } from "@/server/services/request-service";

export default async function RequestsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await verifySession();
  if (!user) redirect("/auth/login");
  if (!canUseRequests(user)) redirect("/unauthorized");
  return <PortalShell user={user}>{children}</PortalShell>;
}
