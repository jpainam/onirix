"use client";

/**
 * Sources: where the workspace's knowledge comes from, and what came in.
 *
 * Three kinds of thing live here and the page keeps them apart. Connected
 * sources are read on a schedule and each has a page of its own. Databases
 * are queried live and index nothing. Uploads are the implicit source every
 * workspace has. Under all of them, one table of every document, because the
 * question "is the thing I need actually in here?" should not depend on
 * knowing which source it came through.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircleIcon,
  ChevronRightIcon,
  PlugIcon,
  PlusIcon,
  RefreshCwIcon,
} from "@onirix/ui/lib/icons";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@onirix/ui/components/badge";
import { Button } from "@onirix/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@onirix/ui/components/empty";
import { Spinner } from "@onirix/ui/components/spinner";

import { Page, PageHeader, Section } from "@/components/page";
import { SourceIcon } from "@/components/source-icon";
import { formatCount, formatInterval, formatRelative } from "@/lib/format";
import { trpc } from "@/utils/trpc";

import { AddSourceDialog } from "./add-source-dialog";
import { DatabasesSection } from "./databases-section";
import { useUpload } from "./use-upload";

/** A source's sync state as a pill. Queued and running both read as activity. */
export const SYNC_STATUS = {
  not_started: { label: "Not synced yet", variant: "muted" },
  queued: { label: "Queued", variant: "info" },
  in_progress: { label: "Syncing", variant: "info" },
  success: { label: "Up to date", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
} as const;

export function SourcesView({
  canCreate,
  canManage,
}: {
  canCreate: boolean;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const files = useUpload();
  const [adding, setAdding] = useState(false);
  const [connectingDatabase, setConnectingDatabase] = useState(false);

  const connectors = useQuery({
    ...trpc.connector.list.queryOptions(),
    // Syncs run in the worker; poll while any of them is queued or running.
    refetchInterval: (state) =>
      state.state.data?.some((row) => row.status === "queued" || row.status === "in_progress") ? 4000 : false,
  });

  const syncNow = useMutation(
    trpc.connector.syncNow.mutationOptions({
      onSuccess: () => {
        toast.success("Sync queued.");
        void queryClient.invalidateQueries({ queryKey: trpc.connector.pathKey() });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const rows = connectors.data ?? [];

  return (
    <Page>
      <PageHeader
        title="Sources"
        description="Connected systems and live databases."
        action={
          canCreate ? (
            <Button onClick={() => setAdding(true)}>
              <PlusIcon />
              Add source
            </Button>
          ) : null
        }
      />

      {files.input}

      <div className="flex flex-col gap-10">
        <Section
          title="Connected sources"
          description="Read on a schedule."
        >
          {connectors.isPending ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : rows.length === 0 ? (
            <Empty variant="outline">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PlugIcon />
                </EmptyMedia>
                <EmptyTitle>Nothing connected yet</EmptyTitle>
                <EmptyDescription>
                  {canCreate
                    ? "Connect a website, Google Drive, OneDrive or an S3 bucket."
                    : "No external source is connected."}
                </EmptyDescription>
              </EmptyHeader>
              {canCreate ? (
                <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                  <PlusIcon />
                  Add source
                </Button>
              ) : null}
            </Empty>
          ) : (
            <div className="flex flex-col gap-2">
              {rows.map((row) => {
                const state = SYNC_STATUS[row.status] ?? SYNC_STATUS.not_started;
                const busy = row.status === "queued" || row.status === "in_progress";
                return (
                  <div
                    key={row.id}
                    className="bg-card hover:bg-tint-01 flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-colors"
                  >
                    <SourceIcon type={row.type} />
                    <Link href={`/admin/sources/${row.id}`} className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <span className="truncate">{row.name}</span>
                        <Badge variant={state.variant}>{state.label}</Badge>
                      </span>
                      <span className="text-ink-03 truncate text-xs leading-4">
                        {row.status === "failed" && row.lastError ? (
                          <span className="text-destructive inline-flex items-center gap-1">
                            <AlertCircleIcon className="size-3" />
                            {row.lastError}
                          </span>
                        ) : (
                          [
                            row.summary,
                            row.lastSyncedAt ? `synced ${formatRelative(row.lastSyncedAt)}` : null,
                            formatInterval(row.syncIntervalMinutes).toLowerCase(),
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        )}
                      </span>
                    </Link>
                    <span className="font-figure text-ink-03 shrink-0">
                      {formatCount(row.documentCount)} {row.documentCount === 1 ? "document" : "documents"}
                    </span>
                    {canManage ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Sync ${row.name} now`}
                        disabled={busy || syncNow.isPending}
                        onClick={() => syncNow.mutate({ sourceId: row.id })}
                      >
                        {busy ? <Spinner /> : <RefreshCwIcon />}
                      </Button>
                    ) : null}
                    <Link
                      href={`/admin/sources/${row.id}`}
                      aria-label={`Open ${row.name}`}
                      className="text-ink-02 hover:text-foreground shrink-0"
                    >
                      <ChevronRightIcon className="size-4" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <DatabasesSection
          canManage={canManage}
          connecting={connectingDatabase}
          onConnectingChange={setConnectingDatabase}
        />

      </div>

      <AddSourceDialog
        open={adding}
        onOpenChange={setAdding}
        canConnectDatabase={canCreate}
        onUploadFiles={files.pick}
        onConnectDatabase={() => setConnectingDatabase(true)}
      />
    </Page>
  );
}
