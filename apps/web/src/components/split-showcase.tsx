// Adapted from Synara (MIT), Copyright (c) 2026 T3 Tools Inc. and Emanuele Di Pietro.
import type { ReactNode } from "react";

import { cn } from "@onirix/ui/lib/utils";

import { Eyebrow, MediaPanel } from "@/components/section";

/**
 * One row of the showcase: copy on one side, the piece of the product it
 * describes on the other, in a flat framed panel. Rows alternate sides with
 * `reverse`. Stacked under `lg`, an even split above it.
 */
export function SplitShowcase({
  kicker,
  title,
  description,
  reverse = false,
  tone = "stone",
  children,
}: {
  /** Sequence label, written `01 / citations`. */
  kicker: string;
  title: string;
  description: string;
  reverse?: boolean;
  tone?: "stone" | "sand" | "paper";
  children: ReactNode;
}) {
  return (
    <div className="grid gap-8 py-10 last:pb-0 sm:py-14 lg:grid-cols-2 lg:items-center lg:gap-16">
      <div className={cn("min-w-0", reverse ? "lg:order-2" : "lg:order-1")}>
        <Eyebrow>{kicker}</Eyebrow>
        <h3 className="mt-3 text-xl leading-tight font-medium tracking-tight sm:text-2xl">
          {title}
        </h3>
        <p className="text-ink-03 mt-3 max-w-xl text-base leading-7 text-pretty">{description}</p>
      </div>
      <MediaPanel
        tone={tone}
        className={cn("min-w-0 sm:p-6 lg:p-8", reverse ? "lg:order-1" : "lg:order-2")}
      >
        {children}
      </MediaPanel>
    </div>
  );
}
