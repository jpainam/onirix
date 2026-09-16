import type { ReactNode } from "react";

import { cn } from "@onirix/ui/lib/utils";

/**
 * The small vocabulary every public page is written in.
 *
 * A page is a stack of `Section`s. Each opens with an `Eyebrow` (a mono
 * label, the way a report labels its figures) and a `Heading`, then says one
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
 * `backdrop` is drawn behind the content across the full section width, for
 * the paper grid and washes; the container sits above it.
 */
export function Section({
  id,
  className,
  backdrop,
  children,
}: {
  id?: string;
  className?: string;
  backdrop?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn("relative scroll-mt-20 overflow-hidden py-20 sm:py-28", className)}
    >
      {backdrop}
      <Container className="relative">{children}</Container>
    </section>
  );
}

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
        "text-ink-03 font-mono text-xs font-medium tracking-widest uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function Heading({
  as: Tag = "h2",
  children,
  className,
}: {
  as?: "h1" | "h2" | "h3";
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tag
      className={cn(
        "text-3xl leading-tight font-medium tracking-display text-balance sm:text-4xl",
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
    <p className={cn("text-ink-03 text-lg leading-8 text-pretty", className)}>
      {children}
    </p>
  );
}

/** Eyebrow, heading and lead stacked, the way every section opens. */
export function SectionIntro({
  eyebrow,
  title,
  lead,
  align = "start",
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  align?: "start" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex max-w-2xl flex-col gap-4",
        align === "center" && "mx-auto items-center text-center",
        className,
      )}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <Heading>{title}</Heading>
      {lead ? <Lead>{lead}</Lead> : null}
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
    <div
      className={cn(
        "bg-card overflow-hidden rounded-2xl border shadow-xl",
        className,
      )}
    >
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
