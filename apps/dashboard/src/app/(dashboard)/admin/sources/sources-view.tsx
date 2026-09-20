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
  DatabaseIcon,
  PlugIcon,
  PlusIcon,
  RefreshCwIcon,
  UploadIcon,
} from "@onirix/ui/lib/icons";
import Link from "next/link";
import { useRef, useState } from "react";
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

import { Page, PageHeader, Row, Section } from "@/components/page";
import { SourceIcon } from "@/components/source-icon";
import { formatCount, formatInterval, formatRelative } from "@/lib/format";
import { trpc } from "@/utils/trpc";

import { AddSourceDialog } from "./add-source-dialog";
import { DatabasesSection } from "./databases-section";
import { DocumentsTable } from "./documents-table";

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
  canDelete,
}: {
  canCreate: boolean;
  canManage: boolean;
  canDelete: boolean;
}) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [connectingDatabase, setConnectingDatabase] = useState(false);

  const connectors = useQuery({
    ...trpc.connector.list.queryOptions(),
    // Syncs run in the worker; poll while any of them is queued or running.
    refetchInterval: (state) =>
      state.state.data?.some((row) => row.status === "queued" || row.status === "in_progress") ? 4000 : false,
  });

  const progress = useQuery({
    ...trpc.knowledge.indexingProgress.queryOptions(),
    refetchInterval: (state) => ((state.state.data?.pending ?? 0) > 0 ? 3000 : false),
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

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (const file of files) formData.append("files", file);

    setUploading(true);
    try {
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error ?? "Upload failed.");
        return;
      }
      if (result.accepted.length > 0) {
        toast.success(`Uploaded ${result.accepted.length} file(s). Onirix is indexing them now.`);
      }
      // Surface per-file rejections; a silent drop looks like data loss.
      for (const rejected of result.rejected ?? []) {
        toast.error(`${rejected.name}: ${rejected.reason}`);
      }
      void queryClient.invalidateQueries();
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const summary = progress.data;
  const rows = connectors.data ?? [];

  return (
    <Page>
      <PageHeader
        icon={DatabaseIcon}
        title="Sources"
        description="Where the workspace's knowledge comes from: uploads, connected systems, and live databases."
        action={
          canCreate ? (
            <Button onClick={() => setAdding(true)}>
              <PlusIcon />
              Add source
            </Button>
          ) : null
        }
      />

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(event) => void upload(event.target.files)}
      />

      <div className="flex flex-col gap-10">
        <Section
          title="Connected sources"
          description="Read on a schedule. Open one to see its settings, its sync history and its documents."
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
                    ? "Connect a website, Google Drive, OneDrive or an S3 bucket, and Onirix keeps it indexed."
                    : "An administrator has not connected any external source."}
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

        <Section title="Uploads" description="Files added by hand, from this page or from a chat.">
          <Row
            icon={<UploadIcon />}
            title="File uploads"
            description="PDF, Word, Excel, CSV, Markdown, HTML, and plain text. 50 MB per file."
            action={
              <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={uploading}>
                {uploading ? <Spinner /> : <UploadIcon />}
                Add files
              </Button>
            }
          />
        </Section>

        <DatabasesSection
          canManage={canManage}
          connecting={connectingDatabase}
          onConnectingChange={setConnectingDatabase}
        />

        <Section
          title="Documents"
          description={
            summary && summary.total > 0
              ? `${formatCount(summary.indexed)} of ${formatCount(summary.total)} indexed${
                  summary.pending > 0 ? ` · ${formatCount(summary.pending)} in progress` : ""
                }${summary.failed > 0 ? ` · ${formatCount(summary.failed)} failed` : ""}. From every source; search by title or address.`
              : "Everything indexed, from every source. Search by title or address."
          }
        >
          <DocumentsTable showSource canManage={canManage} canDelete={canDelete} />
        </Section>
      </div>

      <AddSourceDialog
        open={adding}
        onOpenChange={setAdding}
        canConnectDatabase={canCreate}
        onUploadFiles={() => fileInput.current?.click()}
        onConnectDatabase={() => setConnectingDatabase(true)}
      />
    </Page>
  );
}
