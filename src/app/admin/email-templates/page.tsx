import { redirect } from "next/navigation";

export default async function EmailTemplatesPage() {
  redirect("/admin/email-settings?tab=templates");
}
