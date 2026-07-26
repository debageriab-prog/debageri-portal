import { PortalShell } from "@/components/layout/PortalShell";
import { redirect } from "next/navigation";
import { verifySession } from "@/server/auth/session";
export default async function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await verifySession();
  if (!user) redirect("/auth/login");
  if (!["manager", "admin"].includes(user.role)) redirect("/unauthorized");
  return <PortalShell user={user}>{children}</PortalShell>;
}
