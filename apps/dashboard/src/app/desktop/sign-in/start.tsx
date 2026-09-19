"use client";

import { Button } from "@onirix/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@onirix/ui/components/card";
import { useEffect, useRef, useState } from "react";


import { OnirixWordmark } from "@onirix/ui/brand/onirix-mark";
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
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <Card className="w-full max-w-104">
        <CardHeader>
          <div className="mb-3">
            <OnirixWordmark />
          </div>
          <CardTitle role="heading" aria-level={1}>
            Signing in to Onirix
          </CardTitle>
          <CardDescription>Taking you to Google. Your desktop app is waiting.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
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
        </CardContent>
      </Card>
    </div>
  );
}
