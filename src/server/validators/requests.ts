import { z } from "zod";
import {
  DATED_REQUEST_TYPES,
  isSafeLink,
  NOTE_REQUIRED_STATUSES,
  REQUEST_MAX_LINKS,
  REQUEST_PAYERS,
  REQUEST_STATUSES,
  REQUEST_TYPES,
} from "@/domain/requests";

const optionalDate = z
  .union([z.iso.date(), z.literal("")])
  .transform((value) => value || null);

export const requestFormSchema = z
  .object({
    type: z.enum(REQUEST_TYPES),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2_000).default(""),
    links: z
      .array(z.string().trim().max(500))
      .max(REQUEST_MAX_LINKS)
      .transform((links) => links.filter(Boolean))
      .refine((links) => links.every(isSafeLink), {
        message: "Links must start with http:// or https://",
      }),
    estimatedCostMinor: z.coerce.number().int().min(0).max(10_000_000_000),
    payer: z.enum(REQUEST_PAYERS),
    startDate: optionalDate,
    endDate: optionalDate,
    /** Ids of files already on the request that should be kept (edit only). */
    keepFileIds: z.array(z.string().min(1).max(64)).max(20).default([]),
  })
  .transform((value) =>
    DATED_REQUEST_TYPES.includes(value.type)
      ? value
      : { ...value, startDate: null, endDate: null },
  )
  .refine(
    (value) =>
      !value.startDate || !value.endDate || value.endDate >= value.startDate,
    { message: "The end date is before the start date", path: ["endDate"] },
  );

export type RequestFormInput = z.infer<typeof requestFormSchema>;

export function parseRequestForm(form: FormData) {
  return requestFormSchema.safeParse({
    type: form.get("type"),
    title: form.get("title"),
    description: form.get("description") ?? "",
    links: form.getAll("links").map(String),
    estimatedCostMinor: form.get("estimatedCostMinor"),
    payer: form.get("payer"),
    startDate: form.get("startDate") ?? "",
    endDate: form.get("endDate") ?? "",
    keepFileIds: form.getAll("keepFileIds").map(String),
  });
}

export const requestStatusSchema = z
  .object({
    status: z.enum(REQUEST_STATUSES),
    note: z.string().trim().max(1_000).default(""),
  })
  .refine(
    (value) =>
      !NOTE_REQUIRED_STATUSES.includes(value.status) || value.note.length > 0,
    {
      message: "Asking for changes or rejecting needs a note",
      path: ["note"],
    },
  );
