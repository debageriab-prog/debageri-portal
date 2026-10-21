import { validatePortalEnvironment } from "@/lib/config/environment";

export function isMfaRequired(
  source: Record<string, string | undefined> = process.env,
) {
  return validatePortalEnvironment(source).requireMfa;
}

/** True when the token was minted after a second-factor sign-in. */
export function hasSecondFactor(token: {
  firebase?: { sign_in_second_factor?: string };
}) {
  return Boolean(token.firebase?.sign_in_second_factor);
}
