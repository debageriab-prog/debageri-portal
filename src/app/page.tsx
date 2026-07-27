import { redirect } from "next/navigation";
import { verifySession } from "@/server/auth/session";
export default async function Home() {
  const user = await verifySession();
  if (!user) redirect("/auth/login");
  if (user.role === "admin" || user.role === "manager")
    redirect("/manager/approvals");
  if (user.role === "accountant") redirect("/time-reports");
  redirect("/employee/timesheets/current");
}
