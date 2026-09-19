import Link from "next/link";

import { Button } from "@onirix/ui/components/button";
import { OnirixWordmark } from "@onirix/ui/brand/onirix-mark";

import { SIGN_IN_URL, SIGN_UP_URL } from "@/lib/app-url";

const NAV = [
  { href: "/#product", label: "Product" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#self-host", label: "Self-host" },
  { href: "/security", label: "Security" },
  { href: "/download", label: "Download" },
] as const;

/**
 * The public header. Sticky, translucent, one hairline underneath.
 *
 * The section links are anchors into the landing page so they work from the
 * security page too. Under `md` the middle nav hides and the two account
 * actions carry the header; the pages are short enough to scroll.
 */
export function SiteHeader() {
  return (
    <header className="bg-background/80 sticky top-0 z-20 border-b backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Onirix home" className="shrink-0">
          <OnirixWordmark />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV.map((item) => (
            <Button key={item.href} variant="ghost" size="sm" nativeButton={false} render={<Link href={item.href} />}>
              {item.label}
            </Button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" nativeButton={false} render={<a href={SIGN_IN_URL} />}>
            Sign in
          </Button>
          <Button size="sm" nativeButton={false} render={<a href={SIGN_UP_URL} />}>
            Get started
          </Button>
        </div>
      </div>
    </header>
  );
}
