import type { LucideIcon } from "@onirix/ui/lib/icons";
import type { ReactNode } from "react";

import { cn } from "@onirix/ui/lib/utils";

/**
 * The small vocabulary every public page is written in.
 *
 * A page is a stack of `Section`s, each a flat band of one colour with a
 * hairline along its top. A section opens with an `Eyebrow` (a mono label,
 * the way a report labels its figures) and a modest `Heading`, then says one
 * thing. The container is fixed at 6xl so the header, hero and footer share
 * one left edge down the whole page.
 */
export function Container({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>
      {children}
    </div>
  );
}

/**
 * A band. Pass its colour as `className`: `bg-background` (paper),
 * `bg-tint-01` (stone), `bg-wash-sand` (sand), or
 * `dark bg-tint-01 text-foreground` (ink).
 */
export function Section({
  id,
  className,
  labelledBy,
  children,
}: {
  id?: string;
  className?: string;
  labelledBy?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn("scroll-mt-14 border-t py-14 sm:py-20", className)}
    >
      <Container>{children}</Container>
    </section>
  );
}

/** The one eyebrow style on the site: section labels and showcase kickers. */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-ink-03 font-mono text-xs tracking-widest uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function Heading({
  as: Tag = "h2",
  id,
  children,
  className,
}: {
  as?: "h1" | "h2" | "h3";
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tag
      id={id}
      className={cn(
        "text-2xl leading-tight font-medium tracking-tight text-balance sm:text-3xl",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function Lead({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-ink-03 max-w-2xl text-base leading-7 text-pretty", className)}>
      {children}
    </p>
  );
}

/** Eyebrow, heading and lead stacked, the way every section opens. */
export function SectionIntro({
  eyebrow,
  title,
  titleId,
  lead,
  align = "start",
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  titleId?: string;
  lead?: ReactNode;
  align?: "start" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex max-w-2xl flex-col gap-3",
        align === "center" && "mx-auto items-center text-center",
        className,
      )}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <Heading id={titleId}>{title}</Heading>
      {lead ? <Lead className="mt-2">{lead}</Lead> : null}
    </div>
  );
}

/**
 * Pillars as a two-column grid of cells divided by hairlines, not cards.
 * Keep the cell count even so no cell draws a rule against empty space.
 */
export function HairlineGrid({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("grid border-t sm:grid-cols-2", className)}>{children}</div>;
}

export function HairlineCell({
  icon: Icon,
  title,
  aside,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  aside?: string;
  children: ReactNode;
}) {
  return (
    <div className="hover:bg-foreground/5 border-b py-6 transition-colors sm:p-7 sm:odd:border-r">
      <div className="flex items-center gap-3">
        {Icon ? (
          <span className="bg-card text-ink-04 flex size-9 shrink-0 items-center justify-center rounded-xl border">
            <Icon className="size-4" strokeWidth={1.75} aria-hidden />
          </span>
        ) : null}
        <h3 className="text-base font-medium">{title}</h3>
        {aside ? (
          <span className="text-ink-03 ml-auto hidden shrink-0 font-mono text-xs lg:inline">{aside}</span>
        ) : null}
      </div>
      <p className="text-ink-03 mt-3 text-sm leading-6 text-pretty">{children}</p>
    </div>
  );
}

const PANEL_TONE = {
  stone: "bg-tint-02",
  sand: "bg-wash-sand",
  paper: "bg-background",
} as const;

/**
 * The flat frame every piece of media sits in: a tinted mat with a ring, and
 * the screenshot or mock inside it on its own rounded corners.
 */
export function MediaPanel({
  tone = "stone",
  className,
  children,
}: {
  tone?: keyof typeof PANEL_TONE;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "ring-border rounded-xl p-2 ring-1 sm:rounded-2xl sm:p-3",
        PANEL_TONE[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A window-shaped frame around a product mock. */
export function Frame({
  title,
  children,
  className,
  aside,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  aside?: ReactNode;
}) {
  return (
    <div className={cn("bg-card overflow-hidden rounded-lg border sm:rounded-xl", className)}>
      <div className="flex h-10 items-center gap-3 border-b px-4">
        <span className="flex items-center gap-1.5" aria-hidden>
          <span className="bg-tint-04 size-2.5 rounded-full" />
          <span className="bg-tint-04 size-2.5 rounded-full" />
          <span className="bg-tint-04 size-2.5 rounded-full" />
        </span>
        <span className="text-ink-03 truncate text-xs font-medium">{title}</span>
        {aside ? <span className="ml-auto flex items-center gap-2">{aside}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** The inline marker an answer carries next to a sourced claim. */
export function Cite({ n }: { n: number }) {
  return (
    <span className="bg-info-subtle text-info mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 align-text-top font-mono text-xs leading-none">
      {n}
    </span>
  );
}
