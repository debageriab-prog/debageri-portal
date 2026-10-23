import { redirect } from "next/navigation";
import { verifySession } from "@/server/auth/session";
import { canReadContracts } from "@/server/services/contract-service";

export default async function ContractsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await verifySession();
  if (!user) redirect("/auth/login");
  if (!canReadContracts(user)) redirect("/unauthorized");
  return children;
}
