import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import {
  ImpersonationBar,
  ImpersonationSync,
} from "@/components/layout/ImpersonationBar";
import { LocaleProvider } from "@/components/localization/LocaleProvider";
import { IMPERSONATION_COOKIE } from "@/domain/impersonation";
import {
  defaultLocale,
  isLocale,
  localeCookieName,
} from "@/lib/localization/locale";
import { verifySession } from "@/server/auth/session";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Debageri Portal", template: "%s · Debageri Portal" },
  description: "Debageri Employee Portal",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const store = await cookies();
  const storedLocale = store.get(localeCookieName)?.value;
  const locale = isLocale(storedLocale) ? storedLocale : defaultLocale;
  const viewing = store.has(IMPERSONATION_COOKIE)
    ? await verifySession()
    : null;

  return (
    <html lang={locale === "sv-SE" ? "sv" : "en"}>
      <body>
        <LocaleProvider initialLocale={locale}>
          <ImpersonationSync />
          {viewing && (
            <ImpersonationBar
              name={viewing.impersonatedBy ? viewing.displayName : null}
            />
          )}
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
