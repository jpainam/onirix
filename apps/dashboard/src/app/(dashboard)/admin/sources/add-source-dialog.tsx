"use client";

/**
 * "Add source": one place to bring knowledge in, whatever it comes from.
 *
 * Two steps in one dialog. The first is the catalogue, every kind side by
 * side so an admin who has not decided yet can compare; the second is that
 * kind's form. Uploads and databases live in the same catalogue even though
 * they take other paths, because "where do I add things?" should have one
 * answer.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeftIcon } from "@onirix/ui/lib/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { CONNECTOR_CATALOG, CONNECTOR_TYPES, type ConnectorType } from "@onirix/connectors/config";

import { Button } from "@onirix/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@onirix/ui/components/dialog";

import { SourceIcon, sourceKindLabel } from "@/components/source-icon";
import { trpc } from "@/utils/trpc";

import { ConnectorForm } from "./connector-form";

type Choice = ConnectorType | "file_upload" | "postgres";

export function AddSourceDialog({
  open,
  onOpenChange,
  canConnectDatabase,
  onUploadFiles,
  onConnectDatabase,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canConnectDatabase: boolean;
  onUploadFiles: () => void;
  onConnectDatabase: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<ConnectorType | null>(null);

  const teams = useQuery({ ...trpc.team.listTeams.queryOptions(), enabled: open });

  const create = useMutation(
    trpc.connector.create.mutationOptions({
      onSuccess: (result) => {
        toast.success("Connected. The first sync is queued.");
        void queryClient.invalidateQueries();
        close();
        router.push(`/admin/sources/${result.id}`);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  function close() {
    onOpenChange(false);
    setKind(null);
  }

  function choose(choice: Choice) {
    if (choice === "file_upload") {
      close();
      onUploadFiles();
      return;
    }
    if (choice === "postgres") {
      close();
      onConnectDatabase();
      return;
    }
    setKind(choice);
  }

  const choices: { id: Choice; label: string; description: string }[] = [
    {
      id: "file_upload",
      label: "Upload files",
      description: "PDF, Word, Excel, CSV, Markdown, HTML and plain text, from your computer.",
    },
    ...CONNECTOR_TYPES.map((type) => ({
      id: type as Choice,
      label: CONNECTOR_CATALOG[type].label,
      description: CONNECTOR_CATALOG[type].description,
    })),
    ...(canConnectDatabase
      ? [
          {
            id: "postgres" as Choice,
            label: "PostgreSQL database",
            description: "Live figures the assistant queries with a read-only role. Nothing is indexed.",
          },
        ]
      : []),
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className={kind ? "sm:max-w-2xl" : "sm:max-w-2xl"}>
        {kind === null ? (
          <>
            <DialogHeader>
              <DialogTitle>Add a source</DialogTitle>
              <DialogDescription>
                Where the knowledge lives. Everything it brings in is indexed and cited like an upload.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 sm:grid-cols-2">
              {choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => choose(choice.id)}
                  className="bg-card hover:bg-tint-01 focus-visible:ring-ring/50 flex items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors outline-none focus-visible:ring-3"
                >
                  <SourceIcon type={choice.id} />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-semibold">{choice.label}</span>
                    <span className="text-ink-03 text-xs leading-4">{choice.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <button
                type="button"
                onClick={() => setKind(null)}
                className="text-ink-03 hover:text-foreground mb-1 inline-flex w-fit items-center gap-1 text-xs transition-colors"
              >
                <ChevronLeftIcon className="size-3.5" />
                All kinds
              </button>
              <DialogTitle>
                <span className="flex items-center gap-2">
                  <SourceIcon type={kind} />
                  Connect {sourceKindLabel(kind)}
                </span>
              </DialogTitle>
              <DialogDescription>{CONNECTOR_CATALOG[kind].description}</DialogDescription>
            </DialogHeader>
            <div className="px-0.5">
              <ConnectorForm
                type={kind}
                mode="create"
                teams={teams.data ?? []}
                submitting={create.isPending}
                onCancel={close}
                onSubmit={(values) =>
                  create.mutate({
                    name: values.name,
                    config: values.config,
                    visibility: values.visibility,
                    teamIds: values.teamIds,
                    syncIntervalMinutes: values.syncIntervalMinutes,
                  })
                }
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
