import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Separator } from "@onirix/ui/components/separator";
import { cn } from "@onirix/ui/lib/utils";

/**
 * The scroll container every non-chat page renders inside.
 *
 * Content is capped and centred rather than stretched: long measures are what
 * make a settings page feel like a spreadsheet. The cap is deliberately one
 * value for every page — a per-page width prop only ever drifts, and the seam
 * shows the moment you move between two of them in the sidebar.
 */
export function Page({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className={cn("mx-auto w-full max-w-5xl px-8 py-10", className)}>
        {children}
      </div>
    </div>
  );
}

/**
 * Page masthead: an outlined glyph, the title beneath it, an optional lead
 * paragraph, and a hairline that closes the block.
 */
export function PageHeader({
  icon: Icon,
  title,
  description,
  action,
  divider = true,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  divider?: boolean;
}) {
  return (
    <header className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Icon className="text-ink-04 mb-3 size-8" strokeWidth={1.75} />
          <h1 className="text-2xl leading-8 font-semibold tracking-display">
            {title}
          </h1>
          {description ? (
            <p className="text-ink-03 text-sm leading-5">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0 pt-1">{action}</div> : null}
      </div>
      {divider ? <Separator className="mt-6 mb-8" /> : <div className="mb-8" />}
    </header>
  );
}

/** A titled block within a page, separated by space rather than a box. */
export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex w-full flex-col gap-4", className)}>
      {title || action ? (
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
            {description ? (
              <p className="text-ink-03 text-sm leading-5">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * The repeating row of the admin surfaces: a leading glyph or logo, a title
 * with a muted subtitle, and a control pinned to the right.
 *
 * `interactive` is for rows that are themselves the control (a provider you
 * click to connect); without it the row is a static container for its action.
 */
export function Row({
  icon,
  title,
  description,
  action,
  className,
  interactive = false,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "bg-card flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-colors",
        interactive && "hover:bg-tint-01 cursor-pointer",
        className
      )}
    >
      {icon ? (
        <span className="text-ink-04 flex size-5 shrink-0 items-center justify-center [&_svg]:size-5">
          {icon}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{title}</span>
        {description ? (
          <span className="text-ink-03 truncate text-xs leading-4">{description}</span>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * The blue advisory strip Onyx uses to explain the state of a page — not an
 * error, so it stays informational rather than alarming.
 */
export function Notice({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-info/30 bg-info-subtle flex items-center gap-3 rounded-xl border px-4 py-3.5">
      <Icon className="text-info size-5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold">{title}</span>
        {description ? (
          <span className="text-ink-03 text-xs leading-4">{description}</span>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
