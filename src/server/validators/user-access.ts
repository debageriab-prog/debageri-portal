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

export const documentAccessSchema = z.object({ contracts: z.boolean() });

export function documentAccessMatchesRole(
  role: string,
  access: z.infer<typeof documentAccessSchema>,
) {
  return role === "consultant" || !access.contracts;
}
