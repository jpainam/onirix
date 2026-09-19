"use client";

import { Button } from "@onirix/ui/components/button";
import { Spinner } from "@onirix/ui/components/spinner";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";

import { isCancelled, useDesktopHandoff } from "@/hooks/use-desktop-handoff";
import { authClient, resolveNext } from "@/lib/auth-client";
import { signInPath } from "@/lib/desktop-sign-in";

export function GoogleButton({ label, next }: { label: string; next?: string | null }) {
  const handoff = useDesktopHandoff();
  const [isPending, setIsPending] = useState(false);
  const [waiting, setWaiting] = useState(false);

  /** In a browser, the ordinary redirect to Google. */
  const signInHere = async () => {
    setIsPending(true);
    // On success the browser navigates to Google, so `isPending` is only
    // ever cleared on the error path.
    await authClient.signIn.social(
      { provider: "google", callbackURL: resolveNext(next) },
      {
        onError: (error) => {
          setIsPending(false);
          toast.error(error.error.message || error.error.statusText);
        },
      },
    );
  };

  /**
   * In the desktop app, out to the real browser. Google blocks OAuth in an
   * app window whatever the window calls itself, so this is the only way it
   * can work; the session comes back over the handoff.
   */
  const signInThere = async () => {
    if (!handoff) return;
    setWaiting(true);
    try {
      const { challenge, verifier } = await handoff.begin(resolveNext(next));
      await handoff.bridge.server.openInBrowser(signInPath(challenge, "google"));
      await handoff.wait(verifier);
      // A full load rather than a client transition: the session cookie is
      // new and every server component should read it from scratch.
      window.location.assign(resolveNext(next));
    } catch (error) {
      if (isCancelled(error)) return;
      setWaiting(false);
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  if (waiting) {
    return (
      <div className="space-y-2">
        <Button type="button" variant="outline" className="w-full" disabled>
          <Spinner />
          Waiting for your browser
        </Button>
        <p className="text-ink-03 text-center text-xs">
          Finish signing in with Google in the browser tab we opened.{" "}
          <button
            type="button"
            onClick={() => {
              handoff?.cancel();
              setWaiting(false);
            }}
            className="text-foreground underline underline-offset-4"
          >
            Cancel
          </button>
        </p>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={isPending}
      onClick={() => void (handoff ? signInThere() : signInHere())}
    >
      <Image src="/images/google.svg" alt="" width={18} height={18} aria-hidden unoptimized />
      {label}
    </Button>
  );
}
