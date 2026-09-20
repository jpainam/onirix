import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { OnirixWordmark } from "@onirix/ui/brand/onirix-mark";

import { SIGN_IN_URL, SIGN_UP_URL } from "@/lib/app-url";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#self-host", label: "Self-hosting" },
      { href: "/download", label: "Desktop app" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    title: "Trust",
    links: [
      { href: "/security", label: "Security overview" },
      { href: "/security#permissions", label: "Document permissions" },
      { href: "/security#secrets", label: "Secrets at rest" },
      { href: "/security#hosting", label: "Hosting and providers" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: SIGN_IN_URL, label: "Sign in" },
      { href: SIGN_UP_URL, label: "Create a workspace" },
    ],
  },
];

/**
 * The public footer: the wordmark, three plain link columns under mono
 * labels, and a one-line contact row. No cards, no fills.
 */
export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="col-span-2 flex flex-col gap-3 md:col-span-1">
            <OnirixWordmark />
            <p className="text-ink-03 max-w-xs text-sm leading-6">
              A private AI workspace for company knowledge.
            </p>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title} className="flex flex-col gap-3">
              <p className="text-ink-03 font-mono text-xs tracking-widest uppercase">
                {column.title}
              </p>
              <ul className="flex flex-col gap-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <FooterLink href={link.href}>{link.label}</FooterLink>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="text-ink-03 flex flex-col gap-3 border-t py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>
            Questions, questionnaires, and vulnerability reports:{" "}
            <a
              href="mailto:contact@logestalabs.com"
              className="text-foreground underline-offset-4 hover:underline"
            >
              contact@logestalabs.com
            </a>
          </p>
          <span>Onirix</span>
        </div>
      </div>
    </footer>
  );
}

/** Pages on this site route client-side; the account links leave for the app. */
function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  const className = "text-ink-03 hover:text-foreground text-sm transition-colors";
  if (href.startsWith("/")) {
    return (
      <Link href={href as Route} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
