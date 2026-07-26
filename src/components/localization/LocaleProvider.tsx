"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import en from "@/locales/en.json";
import sv from "@/locales/sv.json";
import {
  defaultLocale,
  isLocale,
  localeCookieName,
  type Locale,
} from "@/lib/localization/locale";

const messages = { "en-SE": en, "sv-SE": sv } as const;
type MessageKey = keyof typeof en;

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
  initialLocale = defaultLocale,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale === "sv-SE" ? "sv" : "en";
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale(nextLocale) {
        if (!isLocale(nextLocale)) return;
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `${localeCookieName}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
        setLocaleState(nextLocale);
      },
      t: (key) => messages[locale][key],
    }),
    [locale],
  );

  return (
    <LocaleContext.Provider value={value}>
      {children}
      <label className="language-picker">
        <span className="sr-only">{value.t("language")}</span>
        <select
          aria-label={value.t("language")}
          value={locale}
          onChange={(event) => value.setLocale(event.target.value as Locale)}
        >
          <option value="en-SE">English</option>
          <option value="sv-SE">Svenska</option>
        </select>
      </label>
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used within LocaleProvider");
  return context;
}
