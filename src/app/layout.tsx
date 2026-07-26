import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Debageri Portal", template: "%s · Debageri Portal" },
  description: "Debageri Medarbetarportal",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
