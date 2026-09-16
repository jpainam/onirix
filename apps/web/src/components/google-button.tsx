"use client";

import { Button } from "@onirix/ui/components/button";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";

import { authClient, resolveNext } from "@/lib/auth-client";

export function GoogleButton({ label, next }: { label: string; next?: string | null }) {
  const [isPending, setIsPending] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={isPending}
      onClick={async () => {
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
      }}
    >
      <Image src="/images/google.svg" alt="" width={18} height={18} aria-hidden />
      {label}
    </Button>
  );
}
