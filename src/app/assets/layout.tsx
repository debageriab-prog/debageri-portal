import { redirect } from "next/navigation";
import { PortalShell } from "@/components/layout/PortalShell";
import { verifySession } from "@/server/auth/session";

/**
 * Anyone signed in may come here: a receipt is opened by the person it was
 * issued to, and each page checks its own access.
 */
export default async function AssetsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await verifySession();
  if (!user) redirect("/auth/login");
  return <PortalShell user={user}>{children}</PortalShell>;
}
