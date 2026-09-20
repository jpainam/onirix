import Link from "next/link";

import { Button } from "@onirix/ui/components/button";
import { OnirixWordmark } from "@onirix/ui/brand/onirix-mark";

import { MobileNav } from "@/components/mobile-nav";
import { NAV } from "@/components/site-nav";
import { SIGN_IN_URL, SIGN_UP_URL } from "@/lib/app-url";

/**
 * The public header. Sticky and translucent, with no rule underneath: the
 * hero starts on the same paper, so the header reads as part of it.
 *
 * Three columns so the section links sit on the page's centre line whatever
 * the wordmark and the account actions weigh. The links are anchors into the
 * landing page so they work from the other pages too. Under `md` they move
 * into a sheet.
 */
export function SiteHeader() {
  return (
    <header className="bg-background/80 sticky top-0 z-20 backdrop-blur-md">
      <div className="mx-auto grid h-16 w-full max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Onirix home" className="justify-self-start">
          <OnirixWordmark />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV.map((item) => (
            <Button key={item.href} variant="ghost" nativeButton={false} render={<Link href={item.href} />}>
              {item.label}
            </Button>
          ))}
        </nav>

        <div className="col-start-3 flex items-center gap-2 justify-self-end">
          <Button
            variant="ghost"
            className="hidden sm:inline-flex"
            nativeButton={false}
            render={<a href={SIGN_IN_URL} />}
          >
            Sign in
          </Button>
          <Button nativeButton={false} render={<a href={SIGN_UP_URL} />}>
            Get started
          </Button>
          <MobileNav signInUrl={SIGN_IN_URL} />
        </div>
      </div>
    </header>
  );
}
