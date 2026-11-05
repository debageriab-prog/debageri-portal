import "server-only";

import { cookies } from "next/headers";
import { defaultLocale, isLocale, localeCookieName } from "./locale";
import { translate, type MessageKey } from "./messages";

export async function getServerLocale() {
  const storedLocale = (await cookies()).get(localeCookieName)?.value;
  return isLocale(storedLocale) ? storedLocale : defaultLocale;
}

export async function getTranslator() {
  const locale = await getServerLocale();
  return (key: MessageKey) => translate(locale, key);
}
