export const supportedLocales = ["en-SE", "sv-SE"] as const;
export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = "en-SE";
export const localeCookieName = "debageri-locale";

export function isLocale(value: unknown): value is Locale {
  return supportedLocales.includes(value as Locale);
}
