import Link from "next/link";

import { OnirixWordmark } from "@onirix/ui/brand/onirix-mark";

import { CtaLink } from "@/components/cta-link";
import { MobileNav } from "@/components/mobile-nav";
import { NAV } from "@/components/site-nav";
import { SIGN_IN_URL, SIGN_UP_URL } from "@/lib/app-url";

/**
 * The public header: one quiet row on the page's own paper. Wordmark, plain
 * text links, and a single pill. It stays put while the bands scroll under
 * it, so it is opaque and carries a hairline.
 *
 * The links are anchors into the landing page so they work from the other
 * pages too. Under `md` they move into a drop-down panel.
 */
export function SiteHeader() {
  return (
    <header className="bg-background sticky top-0 z-20 border-b">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Onirix home" className="shrink-0">
          <OnirixWordmark />
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-ink-03 hover:text-foreground text-sm transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          <a
            href={SIGN_IN_URL}
            className="text-ink-03 hover:text-foreground hidden text-sm transition-colors sm:inline"
          >
            Sign in
          </a>
          <CtaLink href={SIGN_UP_URL} size="sm">
            Get started
          </CtaLink>
          <MobileNav signInUrl={SIGN_IN_URL} />
        </div>
      </div>
    </header>
  );
}
