import type { LucideIcon } from "@onirix/ui/lib/icons";
import type { ReactNode } from "react";

import { PageHeading } from "@onirix/ui/components/settings-section";
import { cn } from "@onirix/ui/lib/utils";

/**
 * The scroll container every non-chat page renders inside.
 *
 * Content is capped and centred rather than stretched: long measures are what
 * make a settings page feel like a spreadsheet. There are two caps and no
 * more. A page of forms and lists takes the narrow column, the one the desktop
 * app's local settings use, so the two read as one product; a page built
 * around a table or charts asks for `wide`.
 */
export function Page({
  children,
  wide = false,
  className,
}: {
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div
        className={cn(
          "mx-auto w-full px-6 pt-10 pb-10",
          wide ? "max-w-5xl" : "max-w-3xl",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Page heading, the one the desktop app's local settings use: the title, an
 * optional lead sentence under it, and an action on the far side.
 */
export function PageHeader(props: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8">
      <PageHeading {...props} />
    </div>
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
