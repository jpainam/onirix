"use client";

import { Button } from "@onirix/ui/components/button";
import { Spinner } from "@onirix/ui/components/spinner";
import { useState } from "react";

import { AuthCard } from "@/components/auth-card";
import { authClient } from "@/lib/auth-client";
import { RETURN_TO_APP } from "@/lib/desktop-sign-in";

/**
 * Confirms that this browser's session may be handed to the desktop app.
 *
 * The desktop window is polling for exactly this. Approving writes a
 * short-lived record the window can trade its verifier for; until then the
 * challenge in the address bar is worth nothing on its own.
 */
export function DesktopHandoff({
  challenge,
  email,
  name,
}: {
  challenge: string;
  email: string;
  name: string | null;
}) {
  const [state, setState] = useState<"ready" | "approving" | "approved">("ready");
  const [failed, setFailed] = useState<string | null>(null);

  /**
   * Hands the user back to the app. Nothing happens if the app is not
   * installed on this machine, which is the case when the link was opened on
   * a phone; the desktop window collects the session by itself either way.
   */
  const returnToApp = () => {
    window.location.href = RETURN_TO_APP;
  };

  const approve = async () => {
    setState("approving");
    setFailed(null);
    const { error } = await authClient.$fetch("/desktop/approve", {
      method: "POST",
      body: { challenge },
    });
    if (error) {
      setState("ready");
      setFailed(error.message || error.statusText || "Could not complete the sign-in.");
      return;
    }
    setState("approved");
    returnToApp();
  };

  if (state === "approved") {
    return (
      <AuthCard
        title="You&apos;re signed in"
        subtitle="Onirix should be back in front of you. You can close this tab."
      >
        <Button variant="outline" className="w-full" onClick={returnToApp}>
          Open the Onirix app
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Open Onirix on your desktop?"
      subtitle={`This signs the desktop app in as ${name ? `${name} (${email})` : email}.`}
      footer={
        <>
          Not you?{" "}
          <a href="/login" className="text-foreground font-medium underline underline-offset-4">
            Sign in as someone else
          </a>
        </>
      }
    >
      {failed ? <p className="text-ink-03 text-sm">{failed}</p> : null}
      <Button className="w-full" disabled={state === "approving"} onClick={() => void approve()}>
        {state === "approving" ? <Spinner /> : null}
        {state === "approving" ? "Opening..." : "Open the desktop app"}
      </Button>
      <p className="text-ink-03 text-xs">
        Only do this if you just started a sign-in from the Onirix desktop app on this computer.
      </p>
    </AuthCard>
  );
}
