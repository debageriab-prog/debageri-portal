import { PortalShell } from "@/components/layout/PortalShell";
import { redirect } from "next/navigation";
import { verifySession } from "@/server/auth/session";
export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await verifySession();
  if (!user) redirect("/auth/login");
  return <PortalShell user={user}>{children}</PortalShell>;
}
