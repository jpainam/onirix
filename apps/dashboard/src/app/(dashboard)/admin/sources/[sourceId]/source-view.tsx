"use client";

/**
 * One connected source, in full.
 *
 * What an admin comes here to learn: is it working, what did the last sync
 * do, and what is in it. What they come here to do: sync it now, change its
 * settings, or take it out. The history is the part that turns "failed" into
 * something a person can act on.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircleIcon,
  ChevronLeftIcon,
  PencilIcon,
  PlugIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "@onirix/ui/lib/icons";
import Link from "next/link";
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
import { Badge } from "@onirix/ui/components/badge";
import { Button } from "@onirix/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@onirix/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@onirix/ui/components/empty";
import { Spinner } from "@onirix/ui/components/spinner";

import { Page, PageHeader, Section } from "@/components/page";
import { SourceIcon, sourceKindLabel } from "@/components/source-icon";
import { formatCount, formatDuration, formatInterval, formatRelative } from "@/lib/format";
import { trpc } from "@/utils/trpc";

import { ConnectorForm } from "../connector-form";
import { DocumentsTable } from "../documents-table";
import { SYNC_STATUS } from "../sources-view";

export function SourceView({
  sourceId,
  canManage,
  canDelete,
}: {
  sourceId: string;
  canManage: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  const connector = useQuery({
    ...trpc.connector.get.queryOptions({ sourceId }),
    refetchInterval: (state) => {
      const status = state.state.data?.status;
      return status === "queued" || status === "in_progress" ? 3000 : false;
    },
  });
  const teams = useQuery({ ...trpc.team.listTeams.queryOptions(), enabled: canManage });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.connector.pathKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.knowledge.pathKey() });
  };

  const syncNow = useMutation(
    trpc.connector.syncNow.mutationOptions({
      onSuccess: () => {
        toast.success("Sync queued.");
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const update = useMutation(trpc.connector.update.mutationOptions());
  const setAudience = useMutation(trpc.knowledge.setSourceDefaultVisibility.mutationOptions());

  const remove = useMutation(
    trpc.connector.remove.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          result.documents > 0
            ? `Source removed. ${formatCount(result.documents)} documents are being cleared from search.`
            : "Source removed.",
        );
        void queryClient.invalidateQueries();
        router.push("/admin/sources");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  if (connector.isPending) {
    return (
      <Page wide>
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </Page>
    );
  }

  // The query scopes by organization, so a source from another workspace
  // arrives here as missing rather than as forbidden.
  if (connector.isError || !connector.data) {
    return (
      <Page wide>
        <Empty variant="outline">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PlugIcon />
            </EmptyMedia>
            <EmptyTitle>No such source</EmptyTitle>
            <EmptyDescription>
              It may have been removed. <Link href="/admin/sources">Back to sources</Link>.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Page>
    );
  }

  const data = connector.data;
  const state = SYNC_STATUS[data.status] ?? SYNC_STATUS.not_started;
  const busy = data.status === "queued" || data.status === "in_progress";
  const running = data.runs.find((run) => run.status === "in_progress" || run.status === "queued");

  async function saveSettings(values: {
    name: string;
    config: Parameters<typeof update.mutate>[0]["config"];
    visibility: "organization" | "teams";
    teamIds: string[];
    syncIntervalMinutes: number | null;
  }) {
    try {
      await update.mutateAsync({
        sourceId,
        name: values.name,
        syncIntervalMinutes: values.syncIntervalMinutes,
        config: values.config,
      });
      await setAudience.mutateAsync({
        sourceId,
        visibility: values.visibility,
        teamIds: values.teamIds,
      });
      toast.success("Settings saved. They apply from the next sync.");
      setEditing(false);
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The settings could not be saved.");
    }
  }

  return (
    <Page wide>
      <Link
        href="/admin/sources"
        className="text-ink-03 hover:text-foreground mb-6 inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ChevronLeftIcon className="size-4" />
        Sources
      </Link>

      <PageHeader
        title={data.name}
        description={`${sourceKindLabel(data.type)} · ${data.summary}`}
        action={
          canManage ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setEditing(true)}>
                <PencilIcon />
                Edit
              </Button>
              <Button disabled={busy || syncNow.isPending} onClick={() => syncNow.mutate({ sourceId })}>
                {busy ? <Spinner /> : <RefreshCwIcon />}
                {busy ? "Syncing" : "Sync now"}
              </Button>
            </div>
          ) : null
        }
      />

      <div className="flex flex-col gap-10">
        {data.status === "failed" && data.lastError ? (
          <div className="border-destructive/30 bg-destructive/10 flex items-start gap-3 rounded-xl border px-4 py-3.5">
            <AlertCircleIcon className="text-destructive mt-0.5 size-5 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold">The last sync failed</span>
              <span className="text-ink-03 text-xs leading-4 break-words">{data.lastError}</span>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="State">
            <Badge variant={state.variant}>{state.label}</Badge>
            {running && running.status === "in_progress" ? (
              <span className="text-ink-03 text-xs">{formatCount(running.documentsSeen)} read so far</span>
            ) : null}
          </Fact>
          <Fact label="Documents">{formatCount(data.documentCount)}</Fact>
          <Fact label="Last synced">{data.lastSyncedAt ? formatRelative(data.lastSyncedAt) : "Never"}</Fact>
          <Fact label="Schedule">{formatInterval(data.syncIntervalMinutes)}</Fact>
        </div>

        <Section
          title="Visible to"
          description="Applies to every document from this source."
        >
          <div className="bg-card flex items-center gap-3 rounded-xl border px-4 py-3.5 text-sm">
            <SourceIcon type={data.type} />
            {data.visibility === "organization"
              ? "Everyone in the workspace"
              : data.teams.length > 0
                ? `Teams: ${data.teams.map((team) => team.name).join(", ")}`
                : "No team chosen, so nobody. Edit the source to pick one."}
          </div>
        </Section>

        <Section title="Sync history" description="The most recent runs, newest first.">
          {data.runs.length === 0 ? (
            <p className="text-ink-03 text-sm">No sync has run yet.</p>
          ) : (
            <div className="bg-card divide-y overflow-hidden rounded-xl border">
              {data.runs.map((run) => {
                const runState = SYNC_STATUS[run.status] ?? SYNC_STATUS.not_started;
                const duration = formatDuration(run.startedAt, run.finishedAt);
                const changes = [
                  run.documentsAdded > 0 ? `${formatCount(run.documentsAdded)} added` : null,
                  run.documentsUpdated > 0 ? `${formatCount(run.documentsUpdated)} updated` : null,
                  run.documentsUnchanged > 0 ? `${formatCount(run.documentsUnchanged)} unchanged` : null,
                  run.documentsRemoved > 0 ? `${formatCount(run.documentsRemoved)} removed` : null,
                ].filter(Boolean);
                return (
                  <div key={run.id} className="flex flex-col gap-1 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant={runState.variant}>{runState.label}</Badge>
                      <span className="font-medium">{formatRelative(run.createdAt)}</span>
                      <span className="text-ink-03 text-xs">
                        {[
                          duration ? `took ${duration}` : null,
                          run.requesterName ? `by ${run.requesterName}` : "scheduled",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {changes.length > 0 ? (
                        <span className="font-figure text-ink-03 ml-auto">{changes.join(" · ")}</span>
                      ) : run.status === "success" ? (
                        <span className="font-figure text-ink-03 ml-auto">nothing found</span>
                      ) : null}
                    </div>
                    {run.error ? (
                      <p className="text-destructive text-xs leading-4 break-words">{run.error}</p>
                    ) : null}
                    {run.notes ? (
                      <p className="text-ink-03 text-xs leading-4 whitespace-pre-line">{run.notes}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Documents" description="What this source has brought in.">
          <DocumentsTable sourceId={sourceId} canManage={canManage} canDelete={canDelete} />
        </Section>

        {canDelete ? (
          <Section title="Remove" description="Removes the source and its documents from search.">
            <div>
              <Button variant="outline" onClick={() => setRemoving(true)}>
                <Trash2Icon className="text-destructive" />
                Remove this source
              </Button>
            </div>
          </Section>
        ) : null}
      </div>

      {editing && data.config ? (
        <Dialog open onOpenChange={(open) => !open && setEditing(false)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                <span className="flex items-center gap-2">
                  <SourceIcon type={data.type} />
                  Edit {data.name}
                </span>
              </DialogTitle>
              <DialogDescription>
                Secrets are not shown. Leave one blank to keep it, or enter a new one to replace it.
              </DialogDescription>
            </DialogHeader>
            <div className="px-0.5">
              <ConnectorForm
                type={data.type}
                mode="edit"
                initial={{
                  name: data.name,
                  config: data.config,
                  visibility: data.visibility === "teams" ? "teams" : "organization",
                  teamIds: data.teams.map((team) => team.id),
                  syncIntervalMinutes: data.syncIntervalMinutes,
                }}
                teams={teams.data ?? []}
                submitting={update.isPending || setAudience.isPending}
                onCancel={() => setEditing(false)}
                onSubmit={(values) => void saveSettings(values)}
              />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      <AlertDialog open={removing} onOpenChange={setRemoving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {data.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its {formatCount(data.documentCount)} {data.documentCount === 1 ? "document stops" : "documents stop"}{" "}
              being searchable now, and the stored copies are deleted. Nothing at the source itself is touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel render={<Button variant="outline" />}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate({ sourceId })}>
              {remove.isPending ? <Spinner /> : null}
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}

/** One figure with its label, for the strip under the header. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-card flex flex-col gap-1 rounded-xl border px-4 py-3">
      <span className="text-ink-03 text-xs">{label}</span>
      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">{children}</span>
    </div>
  );
}
