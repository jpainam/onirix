import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { cn } from "@onirix/ui/lib/utils";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "../index.css";

// Geist and Geist Mono, the pair Synara's public site is set in. They land in
// the variables globals.css reads a brand face from; the product itself leaves
// those unset and runs on the platform's own font.
const sans = Geist({
  subsets: ["latin"],
  variable: "--font-brand-sans",
  display: "swap",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-brand-mono",
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
    <html lang="en" className={cn("font-sans motion-safe:scroll-smooth", sans.variable, mono.variable)}>
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
