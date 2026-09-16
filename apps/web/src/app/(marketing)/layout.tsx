import type { PropsWithChildren } from "react";
import Link from "next/link";

import { Button } from "@onirix/ui/components/button";

import { OnirixWordmark } from "@/components/onirix-mark";

/**
 * The public shell: what a visitor sees before they have an account.
 *
 * Nothing in here touches the session. The landing page decides on its own
 * whether a signed-in visitor should be sent into the app; the security page
 * is worth reading either way, so it never redirects.
 */
export default function MarketingLayout({ children }: PropsWithChildren) {
  return (
    <div className="bg-background text-foreground flex min-h-svh flex-col">
      <header className="border-border/60 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
          <Link href="/" aria-label="Onirix home" className="shrink-0">
            <OnirixWordmark />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="sm" render={<Link href="/security" />}>
              Security
            </Button>
            <Button variant="ghost" size="sm" render={<Link href="/login" />}>
              Sign in
            </Button>
            <Button size="sm" render={<Link href="/login?mode=signup" />}>
              Get started
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-border/60 border-t">
        <div className="text-ink-03 mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>Onirix. A private AI workspace for organizational knowledge.</span>
          <nav className="flex items-center gap-4">
            <Link href="/security" className="hover:text-foreground transition-colors">
              Security
            </Link>
            <Link href="/login" className="hover:text-foreground transition-colors">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
