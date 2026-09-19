import { cn } from "@onirix/ui/lib/utils";

/**
 * The product mark: a faceted aperture, drawn as a filled octagon with a
 * four-point iris knocked out of it.
 *
 * It is a single path so it inherits `currentColor` and stays legible at the
 * 20px the folded sidebar renders it at.
 */
export function OnirixMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("size-6", className)}
    >
      <path
        d="M8.2 1.6h7.6L22.4 8.2v7.6L15.8 22.4H8.2L1.6 15.8V8.2L8.2 1.6Zm3.8 4.1L9.1 12l2.9 6.3 2.9-6.3-2.9-6.3Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Mark plus wordmark, as it appears at the top of the sidebar. */
export function OnirixWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-1.5 text-foreground", className)}>
      <OnirixMark className="size-5.5" />
      <span className="text-xl leading-none font-semibold tracking-hero">
        onirix
      </span>
    </span>
  );
}
