import Link from "next/link";

import { OnirixWordmark } from "@/components/onirix-mark";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#product", label: "Overview" },
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#providers", label: "Model providers" },
      { href: "/#self-host", label: "Self-hosting" },
      { href: "/download", label: "Desktop app" },
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
      { href: "/login", label: "Sign in" },
      { href: "/login?mode=signup", label: "Create a workspace" },
    ],
  },
] as const;

/** The public footer: brand, three link columns and a contact line. */
export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="flex flex-col gap-4">
            <OnirixWordmark />
            <p className="text-ink-03 max-w-xs text-sm leading-6">
              A private AI workspace for company knowledge.
            </p>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title} className="flex flex-col gap-3">
              <p className="text-ink-04 text-sm font-semibold">{column.title}</p>
              <ul className="flex flex-col gap-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-ink-03 hover:text-foreground text-sm transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="text-ink-02 flex flex-col gap-4 border-t py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>
            Questions, questionnaires, and vulnerability reports:{" "}
            <a href="mailto:contact@logestalabs.com" className="hover:text-foreground transition-colors">
              contact@logestalabs.com
            </a>
          </p>
          <span>Onirix</span>
        </div>
      </div>
    </footer>
  );
}
