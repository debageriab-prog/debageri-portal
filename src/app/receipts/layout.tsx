import { redirect } from "next/navigation";
import { PortalShell } from "@/components/layout/PortalShell";
import { verifySession } from "@/server/auth/session";
import { canUseReceipts } from "@/server/services/receipt-service";

export default async function ReceiptsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await verifySession();
  if (!user) redirect("/auth/login");
  if (!canUseReceipts(user)) redirect("/unauthorized");
  return <PortalShell user={user}>{children}</PortalShell>;
}
