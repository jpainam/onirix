import { AppearanceBoot } from "@onirix/ui/components/appearance-settings";
import { APPEARANCE_BOOT_SCRIPT } from "@onirix/ui/lib/appearance";
import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";

import Providers from "@/components/providers";
import { cn } from "@onirix/ui/lib/utils";
import "../index.css";

// The interface is set in the platform's own face, so only code needs a font
// of its own. It lands in the variable globals.css reads the brand mono from.
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-brand-mono",
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
      // `onirix-app` opts into the product's denser type scale (globals.css).
      className={cn("onirix-app font-sans", mono.variable)}
    >
      <body className="antialiased">
        {/* A person's own colours, replayed before anything paints so the page
            does not open in the stock palette and then change. */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT_SCRIPT }} />
        <AppearanceBoot />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
