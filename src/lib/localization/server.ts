import "server-only";

import { cookies } from "next/headers";
import { defaultLocale, isLocale, localeCookieName } from "./locale";
import { translate, type MessageKey } from "./messages";

export async function getTranslator() {
  const storedLocale = (await cookies()).get(localeCookieName)?.value;
  const locale = isLocale(storedLocale) ? storedLocale : defaultLocale;
  return (key: MessageKey) => translate(locale, key);
}
