import { redirect } from "next/navigation";
import { can } from "@/domain/access/permissions";
import { verifySession } from "@/server/auth/session";

export default async function SalariesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await verifySession();
  if (!user) redirect("/auth/login");
  if (!can(user, "finance.salary.view") && user.role !== "admin")
    redirect("/unauthorized");
  return children;
}
