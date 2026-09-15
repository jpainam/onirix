import type { Metadata } from "next";
import { DM_Mono, Hanken_Grotesk } from "next/font/google";

import Providers from "@/components/providers";
import { cn } from "@onirix/ui/lib/utils";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-sans", sans.variable, mono.variable)}
    >
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
