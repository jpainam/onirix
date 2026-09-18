import type { ReactNode } from "react";
import Link from "next/link";

import { OnirixWordmark } from "@/components/onirix-mark";

export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-background flex min-h-svh flex-col">
      <header className="flex items-center px-6 py-6 sm:px-10 sm:py-8">
        <Link href="/" aria-label="Onirix home">
          <OnirixWordmark />
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center px-6 pt-8 pb-16 sm:pt-12 sm:pb-24">
        <div className="flex w-full max-w-96 flex-col gap-7">
          <div className="flex flex-col gap-3">
            <h1 className="text-foreground text-3xl font-medium tracking-tight">
              {title}
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {description}
            </p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
