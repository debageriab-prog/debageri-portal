import { redirect } from "next/navigation";
import { PortalShell } from "@/components/layout/PortalShell";
import { verifySession } from "@/server/auth/session";

export default async function TimeReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await verifySession();
  if (!user) redirect("/auth/login");
  if (!["manager", "admin", "accountant"].includes(user.role))
    redirect("/unauthorized");
  return <PortalShell user={user}>{children}</PortalShell>;
}
