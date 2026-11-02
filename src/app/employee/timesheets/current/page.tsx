import { redirect } from "next/navigation";
import { WeeklyTimesheet } from "@/components/timesheets/WeeklyTimesheet";
import { canReportTime } from "@/domain/access/permissions";
import { verifySession } from "@/server/auth/session";

export default async function CurrentTimesheetPage() {
  const user = (await verifySession())!;
  if (!canReportTime(user)) redirect("/");
  return <WeeklyTimesheet />;
}
