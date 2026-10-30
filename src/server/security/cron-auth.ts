import crypto from "node:crypto";

/** Checks a scheduler's `Authorization: Bearer` header against the secret. */
export function isAuthorizedCronRequest(
  authorization: string | null,
  secret: string | undefined,
) {
  if (!secret || !authorization) return false;
  const digest = (value: string) =>
    crypto.createHash("sha256").update(value).digest();
  return crypto.timingSafeEqual(
    digest(authorization),
    digest(`Bearer ${secret}`),
  );
}
