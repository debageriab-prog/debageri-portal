import { redirect } from "next/navigation";
import { verifySession } from "@/server/auth/session";
export default async function Home() {
  const user = await verifySession();
  if (!user) redirect("/auth/login");
  if (user.role === "admin") redirect("/admin");
  if (user.role === "accountant") redirect("/time-reports");
  if (user.role === "manager" && !user.reportsTime)
    redirect("/manager/approvals");
  redirect("/employee/timesheets/current");
}
