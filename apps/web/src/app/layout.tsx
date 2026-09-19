import type { Metadata } from "next";
import { DM_Mono, Hanken_Grotesk } from "next/font/google";

import { cn } from "@onirix/ui/lib/utils";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "../index.css";

// Hanken Grotesk and DM Mono are the two faces the design system is drawn
// against: the grotesk carries all prose and UI, the mono carries figures.
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = DM_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Onirix",
  description: "Open source AI platform for work",
};

/**
 * The public site: what a visitor sees before they have an account.
 *
 * Nothing in here touches a session or a database. The product is a separate
 * app (apps/dashboard), reached through the links in `@/lib/app-url`.
 *
 * The public pages are always light: no theme is ever set on `<html>`, and
 * individual sections opt into `dark` for an ink band.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", sans.variable, mono.variable)}>
      <body className="antialiased">
        <div className="light bg-background text-foreground flex min-h-svh flex-col">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
