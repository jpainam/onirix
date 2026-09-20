// Adapted from Synara (MIT), Copyright (c) 2026 T3 Tools Inc. and Emanuele Di Pietro.
"use client";

import Link from "next/link";
import { MenuIcon, XIcon } from "@onirix/ui/lib/icons";
import { useEffect, useId, useState } from "react";

import { cn } from "@onirix/ui/lib/utils";

import { NAV } from "@/components/site-nav";

const ITEM =
  "text-ink-03 hover:bg-tint-02 hover:text-foreground focus-visible:ring-ring/50 rounded-xl px-3 py-2.5 text-sm transition-colors outline-none focus-visible:ring-3";

/**
 * The section links under `md`, in a small panel that drops from the menu
 * button. The sign-in URL comes in as a prop because it is built from
 * server-only env.
 *
 * The panel stays mounted so it can fade out as well as in. `invisible` and
 * `inert` keep it out of hit testing, the tab order and the accessibility
 * tree while it is closed.
 */
export function MobileNav({ signInUrl }: { signInUrl: string }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="relative flex items-center md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((current) => !current)}
        className="hover:bg-tint-02 focus-visible:ring-ring/50 flex size-9 cursor-pointer items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-3"
      >
        {open ? <XIcon className="size-5" aria-hidden /> : <MenuIcon className="size-5" aria-hidden />}
      </button>

      <div
        id={menuId}
        inert={!open}
        className={cn(
          "bg-card ease-house absolute top-11 right-0 z-50 w-64 origin-top-right rounded-2xl border p-2 shadow-md transition-all duration-200 motion-reduce:transition-none",
          open ? "visible scale-100 opacity-100" : "invisible scale-95 opacity-0",
        )}
      >
        <nav aria-label="Mobile" className="grid gap-1">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={ITEM}>
              {item.label}
            </Link>
          ))}
          <a href={signInUrl} className={cn(ITEM, "sm:hidden")}>
            Sign in
          </a>
        </nav>
      </div>
    </div>
  );
}
