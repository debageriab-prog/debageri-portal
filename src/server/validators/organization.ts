import { z } from "zod";
import {
  validBankgiro,
  validOrgNumber,
  validPlusgiro,
  validSwedishVatNumber,
} from "@/domain/finance/swedish-identifiers";

const line = (max: number) => z.string().trim().max(max).default("");
const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .refine((value) => !value || z.email().safeParse(value).success)
  .default("");

/** The company details printed on generated invoices. */
export const invoiceSettingsSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  addressLine: line(160),
  postalCode: line(20),
  city: line(80),
  country: line(80),
  phone: line(40),
  email: optionalEmail,
  website: line(160),
  orgNumber: line(20).refine((value) => !value || validOrgNumber(value), {
    message: "orgNumberInvalid",
  }),
  vatNumber: line(20).refine(
    (value) => !value || validSwedishVatNumber(value),
    {
      message: "vatNumberInvalid",
    },
  ),
  fSkatt: z.boolean(),
  bankgiro: line(20).refine((value) => !value || validBankgiro(value), {
    message: "bankgiroInvalid",
  }),
  plusgiro: line(20).refine((value) => !value || validPlusgiro(value), {
    message: "plusgiroInvalid",
  }),
  iban: line(40).refine(
    (value) => !value || /^[A-Z]{2}\d{2}[A-Z0-9 ]{8,36}$/i.test(value),
    {
      message: "ibanInvalid",
    },
  ),
  bic: line(11).refine(
    (value) => !value || /^[A-Z0-9]{8}([A-Z0-9]{3})?$/i.test(value),
    {
      message: "bicInvalid",
    },
  ),
  bankName: line(80),
  paymentTermsDays: z.number().int().min(0).max(365),
  lateInterestText: line(120),
  defaultOurReference: line(120),
  nextInvoiceNumber: z.number().int().min(1).max(999_999_999),
  nextCustomerNumber: z.number().int().min(1).max(999_999_999),
  ocrEnabled: z.boolean(),
});

export type InvoiceSettingsInput = z.infer<typeof invoiceSettingsSchema>;
