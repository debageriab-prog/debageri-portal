const BIND_HOSTS = new Set(["0.0.0.0", "[::]", "::"]);

function normalize(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (BIND_HOSTS.has(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Public portal address for links in emails. Uses the configured
 * `PORTAL_URL` (read at runtime) or `NEXT_PUBLIC_PORTAL_URL`, then the
 * request's Host header. `request.url` is not used: behind Cloud Run it is
 * the container bind address (0.0.0.0:8080). `X-Forwarded-Host` is ignored
 * because callers can set it and turn email links into phishing links.
 */
export function resolvePortalUrl(
  headers: Pick<Headers, "get">,
  env: Record<string, string | undefined> = process.env,
) {
  const configured =
    normalize(env.PORTAL_URL) ?? normalize(env.NEXT_PUBLIC_PORTAL_URL);
  if (configured) return configured;
  const host = headers.get("host")?.trim();
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0];
  const protocol = forwardedProto?.trim() === "http" ? "http" : "https";
  return (host && normalize(`${protocol}://${host}`)) ?? "";
}
