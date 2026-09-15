"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@onirix/ui/components/collapsible";
import { cn } from "@onirix/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { BookIcon, ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";

// Widened from `ComponentProps<"div">` so the Collapsible's own props —
// `defaultOpen` in particular — are typed through to the root.
export type SourcesProps = ComponentProps<typeof Collapsible>;

// The upstream component styles the Collapsible directly; here the design
// system owns that, so callers place and size this with a wrapper of their own.
export const Sources = (props: SourcesProps) => <Collapsible {...props} />;

export type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  count: number;
};

export const SourcesTrigger = ({
  className,
  count,
  children,
  ...props
}: SourcesTriggerProps) => (
  <CollapsibleTrigger className="group/sources" {...props}>
    {children ?? (
      // The layout lives on a plain span: the trigger owns its own spacing, and
      // a <p> inside a button is invalid markup besides.
      <span className={cn("flex items-center gap-2", className)}>
        <span className="font-medium">Used {count} sources</span>
        {/* Base UI marks the open trigger with `data-panel-open`; upstream's
            Radix `data-state` selector never matched here. */}
        <ChevronDownIcon className="size-4 transition-transform group-data-[panel-open]/sources:rotate-180" />
      </span>
    )}
  </CollapsibleTrigger>
);

export type SourcesContentProps = ComponentProps<typeof CollapsibleContent>;

export const SourcesContent = ({
  className,
  children,
  ...props
}: SourcesContentProps) => (
  <CollapsibleContent {...props}>
    <div className={cn("mt-3 flex w-fit flex-col gap-2", className)}>
      {children}
    </div>
  </CollapsibleContent>
);

export type SourceProps = ComponentProps<"a">;

export const Source = ({ href, title, children, ...props }: SourceProps) => (
  <a
    className="flex items-center gap-2"
    href={href}
    rel="noreferrer"
    target="_blank"
    {...props}
  >
    {children ?? (
      <>
        <BookIcon className="size-4" />
        <span className="block font-medium">{title}</span>
      </>
    )}
  </a>
);

const sourceButtonVariants = cva(
  "flex max-w-xs items-center gap-2 rounded-lg border px-2 py-1 text-left transition-colors",
  {
    variants: {
      variant: {
        default: "bg-card text-ink-03 hover:bg-tint-01 hover:text-ink-04",
        // The source whose passage is currently open, tied to the selection
        // blue the rest of the app uses.
        active: "border-info bg-info-subtle text-ink-04",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type SourceButtonProps = ComponentProps<"button"> &
  VariantProps<typeof sourceButtonVariants>;

/**
 * A source that reveals its passage in the app rather than navigating away.
 *
 * Grounded answers cite internal documents, most of which have no URL to open,
 * so the list needs an entry that is a real button: focusable, and announced as
 * something that acts rather than something that links.
 */
export const SourceButton = ({
  title,
  children,
  className,
  variant,
  ...props
}: SourceButtonProps) => (
  <button
    className={cn(sourceButtonVariants({ variant, className }))}
    type="button"
    {...props}
  >
    {children ?? (
      <>
        <BookIcon className="size-4" />
        <span className="block font-medium">{title}</span>
      </>
    )}
  </button>
);
