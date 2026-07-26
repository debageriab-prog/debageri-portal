import { redirect } from "next/navigation";
import { verifySession } from "@/server/auth/session";
export default async function Home() {
  const user = await verifySession();
  if (!user) redirect("/auth/login");
  redirect(user.role === "admin" ? "/admin" : "/employee/timesheets/current");
}
