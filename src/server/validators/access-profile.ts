import { z } from "zod";
import {
  PERMISSION_KEYS,
  permissionsForAudience,
} from "@/domain/access/permissions";

export const accessProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(300),
    audience: z.enum(["consultant", "staff"]),
    permissions: z.array(z.enum(PERMISSION_KEYS)).max(PERMISSION_KEYS.length),
  })
  .superRefine((value, context) => {
    const allowed = permissionsForAudience(value.audience);
    if (value.permissions.some((key) => !allowed.includes(key)))
      context.addIssue({
        code: "custom",
        message: "The profile grants more than its audience can hold",
      });
  });

export type AccessProfileInput = z.infer<typeof accessProfileSchema>;

export const accessProfileIdSchema = z.string().trim().min(1).max(200);
