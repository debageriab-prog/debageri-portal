import { z } from "zod";

export const financeAccessSchema = z
  .object({
    enabled: z.boolean(),
    myFinance: z.boolean(),
    myInvoices: z.boolean(),
  })
  .superRefine((access, context) => {
    if (!access.enabled && (access.myFinance || access.myInvoices))
      context.addIssue({
        code: "custom",
        message: "Finance must be enabled before granting page access",
      });
    if (access.enabled && !access.myFinance && !access.myInvoices)
      context.addIssue({
        code: "custom",
        message: "Select at least one finance page",
      });
  });

export function financeAccessMatchesRole(
  role: string,
  access: z.infer<typeof financeAccessSchema>,
) {
  return (
    role === "consultant" ||
    (!access.enabled && !access.myFinance && !access.myInvoices)
  );
}

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
});

export const documentAccessSchema = z.object({
  contracts: z.boolean(),
  payslips: z.boolean().default(false),
  receipts: z.boolean().default(false),
});

export function documentAccessMatchesRole(
  role: string,
  access: z.infer<typeof documentAccessSchema>,
) {
  return (
    (role === "consultant" || !access.contracts) &&
    (["consultant", "manager"].includes(role) ||
      (!access.payslips && !access.receipts))
  );
}
