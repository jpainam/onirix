import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@onirix/ui/lib/utils";

const BASE =
  "focus-visible:ring-ring/50 inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3";

const VARIANT = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/85",
  secondary: "text-foreground hover:bg-tint-02 border",
} as const;

const SIZE = {
  default: "h-10 px-5",
  sm: "h-8 px-3.5",
} as const;

/**
 * The site's call to action: a pill, filled for the one thing a section
 * wants done and bordered for the alternative. It is a link, never a button,
 * because every action on the public site goes somewhere.
 *
 * Paths on this site route client-side; anything else (the product, a
 * download, a mailto) is a plain anchor.
 */
export function CtaLink({
  href,
  variant = "primary",
  size = "default",
  download,
  className,
  children,
}: {
  href: string;
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
  download?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const classes = cn(BASE, VARIANT[variant], SIZE[size], className);
  if (!download && (href.startsWith("/") || href.startsWith("#"))) {
    return (
      <Link href={href as Route} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} download={download} className={classes}>
      {children}
    </a>
  );
}

/** The same pill when there is nothing to link to yet. */
export function CtaPlaceholder({ children }: { children: ReactNode }) {
  return (
    <span className={cn(BASE, SIZE.default, "bg-tint-03 text-ink-03 cursor-not-allowed")}>
      {children}
    </span>
  );
}
