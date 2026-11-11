import { z } from "zod";
import { supportedLocales } from "@/lib/localization/locale";

export function employmentDatesValid(
  employmentStartDate: string | null,
  employmentEndDate: string | null,
) {
  return (
    !employmentStartDate ||
    !employmentEndDate ||
    employmentEndDate >= employmentStartDate
  );
}

/** Former employees stay selectable so a late final payslip or contract can be filed. */
export function receivesDocuments(user: Record<string, unknown>) {
  return user.status === "active" || Boolean(user.employmentEndDate);
}

export const emailPreferencesSchema = z.object({
  receipts: z.boolean(),
  payslips: z.boolean(),
  timesheets: z.boolean(),
  requests: z.boolean().default(true),
  assets: z.boolean().default(true),
});

export const localeSchema = z.enum(supportedLocales);
