// Adapted from Synara (MIT), Copyright (c) 2026 T3 Tools Inc. and Emanuele Di Pietro.

/**
 * The leading chrome cluster: the sidebar toggle, then back and forward.
 *
 * On macOS it is one element that is always there, on the window's top row
 * beside the traffic lights, above the sidebar when that is open. The buttons
 * therefore never move: opening or closing the sidebar with the toggle leaves
 * the toggle under the pointer, ready to be pressed again. (Synara gets the
 * same effect by rendering one cluster component in two places. One element
 * that stays put is simpler, and cannot drift.)
 *
 * On Windows and Linux there is a real title bar above the page, so the toggle
 * lives in the sidebar's header and this only appears once the sidebar is
 * closed, holding the two controls worth keeping in reach.
 *
 * Where it sits and how the page makes room are arranged in globals.css, keyed
 * on the `shell-controls` slot. Its contract: `data-over-content` is set only
 * while the cluster overlaps the page (sidebar closed, or a narrow window where
 * the sidebar is a sheet), and the page's header row pads left only then.
 */
import { ArrowLeftIcon, ArrowRightIcon, PanelLeftIcon, SquarePenIcon } from "@onirix/ui/lib/icons";
import type { ReactNode } from "react";

import { useSidebar } from "@onirix/ui/components/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@onirix/ui/components/tooltip";
import { cn } from "@onirix/ui/lib/utils";

const BUTTON =
  "text-ink-02 hover:bg-tint-02 hover:text-ink-04 disabled:hover:text-ink-02 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-40 disabled:hover:bg-transparent motion-reduce:transition-none";

function ControlButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className={BUTTON}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function ShellControls({
  mac,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onNewSession,
}: {
  mac: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onNewSession: () => void;
}) {
  const { toggleSidebar, state, isMobile } = useSidebar();
  const closed = state === "collapsed" || isMobile;

  if (!mac && !closed) return null;

  return (
    <div
      data-slot="shell-controls"
      data-over-content={closed ? "true" : undefined}
      className={cn(
        "fixed top-0 left-0 z-20 flex h-shell items-center gap-1 pl-3",
        // Only where it appears and disappears. On macOS it is always there,
        // and fading in something that never left would be a flicker.
        !mac && "animate-in fade-in duration-200 motion-reduce:animate-none",
      )}
    >
      <ControlButton label={closed ? "Open sidebar" : "Close sidebar"} onClick={toggleSidebar}>
        <PanelLeftIcon className="size-4.5" />
      </ControlButton>
      {mac ? (
        <>
          <ControlButton label="Back" onClick={onBack} disabled={!canGoBack}>
            <ArrowLeftIcon className="size-4.5" />
          </ControlButton>
          <ControlButton label="Forward" onClick={onForward} disabled={!canGoForward}>
            <ArrowRightIcon className="size-4.5" />
          </ControlButton>
        </>
      ) : (
        <ControlButton label="New session" onClick={onNewSession}>
          <SquarePenIcon className="size-4.5" />
        </ControlButton>
      )}
    </div>
  );
}
