import { redirect } from "next/navigation";
import { can } from "@/domain/access/permissions";
import { PortalShell } from "@/components/layout/PortalShell";
import { verifySession } from "@/server/auth/session";

export default async function RemindersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await verifySession();
  if (!user) redirect("/auth/login");
  if (!can(user, "time.reminders.view")) redirect("/unauthorized");
  return <PortalShell user={user}>{children}</PortalShell>;
}
