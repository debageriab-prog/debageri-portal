import { describe, expect, it } from "vitest";
import { resolvePortalUrl } from "@/lib/config/portal-url";

const headers = (values: Record<string, string>) => new Headers(values);

describe("portal URL for email links", () => {
  it("prefers the configured address", () => {
    expect(
      resolvePortalUrl(headers({ host: "evil.example" }), {
        PORTAL_URL: "https://portal.debageri.se/",
      }),
    ).toBe("https://portal.debageri.se");
    expect(
      resolvePortalUrl(headers({}), {
        NEXT_PUBLIC_PORTAL_URL: "https://dev.debageri.se",
      }),
    ).toBe("https://dev.debageri.se");
  });

  it("uses the public Host header instead of the container address", () => {
    expect(
      resolvePortalUrl(
        headers({
          host: "portal-dev-abc.a.run.app",
          "x-forwarded-proto": "https",
        }),
        {},
      ),
    ).toBe("https://portal-dev-abc.a.run.app");
  });

  it("ignores bind addresses and forwarded hosts", () => {
    expect(
      resolvePortalUrl(headers({ host: "0.0.0.0:8080" }), {
        NEXT_PUBLIC_PORTAL_URL: "https://0.0.0.0:8080",
      }),
    ).toBe("");
    expect(
      resolvePortalUrl(
        headers({
          host: "portal.debageri.se",
          "x-forwarded-host": "evil.example",
        }),
        {},
      ),
    ).toBe("https://portal.debageri.se");
  });

  it("keeps http only when the proxy says so", () => {
    expect(
      resolvePortalUrl(
        headers({ host: "localhost:3000", "x-forwarded-proto": "http" }),
        {},
      ),
    ).toBe("http://localhost:3000");
  });
});
