import { redirect } from "next/navigation";

export default async function ReminderSettingsPage() {
  redirect("/admin/email-settings");
}
