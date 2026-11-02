import { redirect } from "next/navigation";
import { homePath } from "@/domain/access/permissions";
import { verifySession } from "@/server/auth/session";
export default async function Home() {
  const user = await verifySession();
  if (!user) redirect("/auth/login");
  redirect(homePath(user));
}
