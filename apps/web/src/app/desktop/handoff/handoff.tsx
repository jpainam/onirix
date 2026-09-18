"use client";

import { Button } from "@onirix/ui/components/button";
import { Spinner } from "@onirix/ui/components/spinner";
import { useState } from "react";

import { AuthCard } from "@/components/auth-card";
import { authClient } from "@/lib/auth-client";

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
  };

  if (state === "approved") {
    return (
      <AuthCard title="You&apos;re signed in" subtitle="Go back to the Onirix app.">
        <p className="text-ink-03 text-sm">You can close this tab.</p>
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
