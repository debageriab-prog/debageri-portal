import en from "@/locales/en.json";
import sv from "@/locales/sv.json";
import type { Locale } from "./locale";

export const messages = { "en-SE": en, "sv-SE": sv } as const;
export type MessageKey = keyof typeof en;

export function translate(locale: Locale, key: MessageKey) {
  return messages[locale][key];
}
