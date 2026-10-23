import { redirect } from "next/navigation";
import { verifySession } from "@/server/auth/session";
import { canReadPayslips } from "@/server/services/payslip-service";

export default async function PayslipsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await verifySession();
  if (!user) redirect("/auth/login");
  if (!canReadPayslips(user)) redirect("/unauthorized");
  return children;
}
