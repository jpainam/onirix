"use client";

import { useMutation } from "@tanstack/react-query";
import { RotateCcwIcon } from "@onirix/ui/lib/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@onirix/ui/components/alert-dialog";
import { Button } from "@onirix/ui/components/button";
import { Spinner } from "@onirix/ui/components/spinner";

import { Row } from "@/components/page";
import { trpc } from "@/utils/trpc";

/**
 * Clears the workspace's model configuration and returns to setup.
 *
 * Narrow on purpose: chats, documents and the search index are untouched, so
 * this is a way to change your mind about a provider rather than a way to
 * erase the workspace.
 */
export function ResetSettings() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const reset = useMutation(
    trpc.onboarding.reset.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        toast.success("Model settings cleared.");
        router.push("/onboarding");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <>
      <Row
        icon={<RotateCcwIcon />}
        title="Reset all settings"
        description="Clear model settings and return to setup."
        action={
          <Button variant="destructive" onClick={() => setOpen(true)}>
            Reset
          </Button>
        }
      />

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all settings?</AlertDialogTitle>
            {/* Reindexing is the one consequence that is not obvious from the
                action, so it is the one thing the dialog spends words on. */}
            <AlertDialogDescription>
              Chats and documents stay. A new embedding model requires re-uploading
              documents.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel render={<Button variant="outline" />}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={reset.isPending}
              onClick={() => reset.mutate()}
            >
              {reset.isPending ? <Spinner /> : null}
              Reset settings
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
