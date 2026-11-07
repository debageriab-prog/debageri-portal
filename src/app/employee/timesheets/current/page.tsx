import { redirect } from "next/navigation";
import { WeeklyTimesheet } from "@/components/timesheets/WeeklyTimesheet";
import { VacationOverviewCard } from "@/components/vacation/VacationOverviewCard";
import { canReportTime } from "@/domain/access/permissions";
import { stockholmDateTime } from "@/lib/dates/stockholm";
import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { getVacationOverview } from "@/server/services/vacation-service";

export default async function CurrentTimesheetPage() {
  const user = (await verifySession())!;
  if (!canReportTime(user)) redirect("/");
  const { db } = getAdminServices();
  const vacation = await getVacationOverview(
    db,
    user.organizationId,
    user.id,
    stockholmDateTime().date,
  ).catch(() => null);
  return (
    <WeeklyTimesheet
      vacation={
        vacation && <VacationOverviewCard overview={vacation} mode="own" />
      }
    />
  );
}
