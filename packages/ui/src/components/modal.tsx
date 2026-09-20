"use client"

/**
 * The dialog frame of the settings screens and of the desktop app's local mode.
 *
 * Built on the same Base UI primitive as Dialog, without that component's
 * blurred backdrop: a flat scrim is enough to say "this is over that", and the
 * app behind stays legible, which matters for a setup the person is free to
 * ignore. The only motion is the popup's own scale and fade on the way in and
 * out, and none at all with reduced motion.
 */
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "@onirix/ui/lib/icons";
import type { ReactNode, RefObject } from "react";

import { Button } from "@onirix/ui/components/button";
import { cn } from "@onirix/ui/lib/utils";

export function Modal({
  open,
  onOpenChange,
  className,
  children,
  showCloseButton = true,
  initialFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  children: ReactNode;
  showCloseButton?: boolean;
  /**
   * What takes focus as the dialog opens. Left out, it is the first control in
   * the markup, which is rarely the one a person would reach for.
   */
  initialFocus?: RefObject<HTMLElement | null>;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 fixed inset-0 z-50 bg-black/30 duration-150 motion-reduce:animate-none dark:bg-black/60" />
        <DialogPrimitive.Popup
          initialFocus={initialFocus}
          className={cn(
            "bg-popover text-popover-foreground ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100%-2rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl text-sm shadow-lg ring-1 duration-150 outline-none motion-reduce:animate-none",
            className,
          )}
        >
          {children}
          {showCloseButton ? (
            <DialogPrimitive.Close
              render={
                <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" />
              }
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const ModalTitle = DialogPrimitive.Title;
export const ModalDescription = DialogPrimitive.Description;
