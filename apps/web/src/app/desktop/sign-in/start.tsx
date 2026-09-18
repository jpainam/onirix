"use client";

import { Button } from "@onirix/ui/components/button";
import { useEffect, useRef, useState } from "react";

import { AuthCard } from "@/components/auth-card";
import { authClient } from "@/lib/auth-client";

/**
 * Sends this browser to Google on arrival.
 *
 * This page is opened by the desktop app, in a tab the user did not click on
 * themselves, so it says what is happening before it navigates. The button is
 * for the case where the automatic hop did not take, which is mostly a popup
 * blocker on a slow tab.
 */
export function DesktopSignInStart({ callbackURL }: { callbackURL: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const started = useRef(false);

  const go = async () => {
    setFailed(null);
    await authClient.signIn.social(
      { provider: "google", callbackURL },
      { onError: (error) => setFailed(error.error.message || error.error.statusText) },
    );
  };

  useEffect(() => {
    // Effects run twice in development; the second one would start a second
    // OAuth flow and invalidate the first one's state cookie.
    if (started.current) return;
    started.current = true;
    void go();
  }, []);

  return (
    <AuthCard
      title="Signing in to Onirix"
      subtitle="Taking you to Google. Your desktop app is waiting."
    >
      {failed ? (
        <div className="space-y-3">
          <p className="text-ink-03 text-sm">{failed}</p>
          <Button className="w-full" onClick={() => void go()}>
            Try again
          </Button>
        </div>
      ) : (
        <Button variant="outline" className="w-full" onClick={() => void go()}>
          Continue with Google
        </Button>
      )}
    </AuthCard>
  );
}
