import type { PropsWithChildren } from "react";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

/**
 * The public shell: what a visitor sees before they have an account.
 *
 * Nothing in here touches the session. The landing page decides on its own
 * whether a signed-in visitor should be sent into the app; the security page
 * is worth reading either way, so it never redirects.
 *
 * The public pages are always light. The `light` scope re-applies the light
 * tokens beneath whatever theme the visitor's system set on `<html>`, and
 * individual sections opt back into `dark` for an ink band.
 */
export default function MarketingLayout({ children }: PropsWithChildren) {
  return (
    <div className="light bg-background text-foreground flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
