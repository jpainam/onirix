// Adapted from Synara (MIT), Copyright (c) 2026 T3 Tools Inc. and Emanuele Di Pietro.

/**
 * The footer every setup step shares: progress dots, "Skip setup", Back, and
 * the step's primary action. It holds its position from step to step so the
 * eye and the pointer never have to find it again. No divider: space alone
 * separates it from the body.
 */
import type { RefObject } from "react";

import { Button } from "@onirix/ui/components/button";
import { Spinner } from "@onirix/ui/components/spinner";
import { cn } from "@onirix/ui/lib/utils";

import { INSET } from "./layout";

const FOOTER_BUTTON = "h-9 rounded-full px-4";

export function StepFooter({
  position,
  positions,
  showBack,
  showSkip,
  onBack,
  onSkip,
  primaryLabel,
  primaryBusyLabel,
  onPrimary,
  primaryForm,
  primaryDisabled = false,
  primaryBusy = false,
  navigationLocked = false,
  primaryRef,
}: {
  /** Which dot is current, from zero. */
  position: number;
  positions: number;
  showBack: boolean;
  showSkip: boolean;
  onBack: () => void;
  onSkip: () => void;
  primaryLabel: string;
  primaryBusyLabel?: string;
  onPrimary?: () => void;
  /** When set, the primary submits that form instead of calling `onPrimary`. */
  primaryForm?: string;
  primaryDisabled?: boolean;
  primaryBusy?: boolean;
  /** Blocks Back and Skip while something that cannot be abandoned is running. */
  navigationLocked?: boolean;
  primaryRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className={cn("flex shrink-0 items-center gap-2 pt-5 pb-6", INSET)}>
      <div className="flex flex-1 items-center gap-4">
        <div
          className="flex items-center gap-1.5"
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={1}
          aria-valuemax={positions}
          aria-valuenow={position + 1}
        >
          {Array.from({ length: positions }, (_, index) => (
            <span
              key={index}
              className={cn(
                "size-1.5 rounded-full transition-colors motion-reduce:transition-none",
                index === position
                  ? "bg-foreground"
                  : index < position
                    ? "bg-foreground/50"
                    : "bg-tint-04",
              )}
            />
          ))}
        </div>
        {showSkip ? (
          <button
            type="button"
            disabled={navigationLocked}
            className="text-ink-03 hover:text-foreground text-sm transition-colors disabled:opacity-60 motion-reduce:transition-none"
            onClick={onSkip}
          >
            Skip setup
          </button>
        ) : null}
      </div>
      {showBack ? (
        <Button
          variant="ghost"
          className={FOOTER_BUTTON}
          disabled={navigationLocked}
          onClick={onBack}
        >
          Back
        </Button>
      ) : null}
      <Button
        ref={primaryRef}
        type={primaryForm ? "submit" : "button"}
        form={primaryForm}
        className={FOOTER_BUTTON}
        disabled={primaryDisabled || primaryBusy}
        onClick={primaryForm ? undefined : onPrimary}
      >
        {primaryBusy ? <Spinner /> : null}
        {primaryBusy ? (primaryBusyLabel ?? primaryLabel) : primaryLabel}
      </Button>
    </div>
  );
}
