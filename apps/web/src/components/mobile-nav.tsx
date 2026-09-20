"use client";

import Link from "next/link";
import { MenuIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@onirix/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@onirix/ui/components/sheet";

import { NAV } from "@/components/site-nav";

/**
 * The section links under `md`, in a sheet. The sign-in URL comes in as a
 * prop because it is built from server-only env.
 */
export function MobileNav({ signInUrl }: { signInUrl: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" />}
      >
        <MenuIcon />
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-2" aria-label="Mobile">
          {NAV.map((item) => (
            <Button
              key={item.href}
              variant="ghost"
              size="lg"
              className="justify-start"
              nativeButton={false}
              render={<Link href={item.href} onClick={() => setOpen(false)} />}
            >
              {item.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="lg"
            className="justify-start"
            nativeButton={false}
            render={<a href={signInUrl} />}
          >
            Sign in
          </Button>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
