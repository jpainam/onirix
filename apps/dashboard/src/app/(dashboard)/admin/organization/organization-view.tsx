"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@onirix/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@onirix/ui/components/dialog";
import { Input } from "@onirix/ui/components/input";
import { Label } from "@onirix/ui/components/label";
import { Spinner } from "@onirix/ui/components/spinner";

import { authClient } from "@/lib/auth-client";
import { useAuthAction } from "@/lib/auth-action";

/**
 * Renames the workspace.
 *
 * The write goes through Better Auth's `organization.update` rather than a tRPC
 * procedure, for the same reason every other membership and team mutation does:
 * the plugin holds the `organization: ["update"]` check, and a second path here
 * would be a second thing to keep in agreement with it forever.
 */
export function RenameOrganization({
  organizationId,
  name: currentName,
}: {
  organizationId: string;
  name: string;
}) {
  const run = useAuthAction();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();

  async function submit() {
    setSaving(true);
    try {
      const ok = await run(
        () =>
          authClient.organization.update({
            organizationId,
            data: { name: trimmed },
          }),
        "Workspace renamed.",
      );
      if (!ok) return;
      setOpen(false);
      // The sidebar and this page render the name on the server, so the toast
      // alone would leave the old one on screen until the next navigation.
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setName(currentName);
          setOpen(true);
        }}
      >
        Edit
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename workspace</DialogTitle>
            <DialogDescription>
              Everyone in the workspace sees this name.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="organization-name">Name</Label>
            <Input
              id="organization-name"
              value={name}
              placeholder="Acme Inc"
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void submit()}
              disabled={!trimmed || trimmed === currentName || saving}
            >
              {saving ? <Spinner /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
