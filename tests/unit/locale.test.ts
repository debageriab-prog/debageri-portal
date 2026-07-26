import { describe, expect, it } from "vitest";
import {
  defaultLocale,
  isLocale,
  localeCookieName,
} from "@/lib/localization/locale";

describe("locale configuration", () => {
  it("uses English as the default", () => {
    expect(defaultLocale).toBe("en-SE");
    expect(localeCookieName).toBe("debageri-locale");
  });

  it("accepts only supported portal locales", () => {
    expect(isLocale("en-SE")).toBe(true);
    expect(isLocale("sv-SE")).toBe(true);
    expect(isLocale("en-US")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
