import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { LocaleProvider } from "@/components/localization/LocaleProvider";
import {
  defaultLocale,
  isLocale,
  localeCookieName,
} from "@/lib/localization/locale";
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
  const storedLocale = (await cookies()).get(localeCookieName)?.value;
  const locale = isLocale(storedLocale) ? storedLocale : defaultLocale;

  return (
    <html lang={locale === "sv-SE" ? "sv" : "en"}>
      <body>
        <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
