import { z } from "zod";

export const userGroupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300),
  status: z.enum(["active", "disabled"]),
});

export type UserGroupInput = z.infer<typeof userGroupSchema>;

export const groupIdsSchema = z
  .array(z.string().trim().min(1).max(200))
  .max(200);
