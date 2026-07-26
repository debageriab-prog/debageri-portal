import { PortalShell } from "@/components/layout/PortalShell";
import { redirect } from "next/navigation";
import { verifySession } from "@/server/auth/session";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await verifySession();
  if (!user) redirect("/auth/login");
  if (user.role !== "admin") redirect("/unauthorized");
  return <PortalShell user={user}>{children}</PortalShell>;
}
