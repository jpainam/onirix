"use client";

/**
 * The documents a workspace has indexed, paged from the server.
 *
 * One component for the Sources page (every document, with its source named)
 * and for a source's own page (that source's documents). It has to work at
 * the size a website or a drive produces, so the browser only ever holds one
 * page and every filter is a query the server answers.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLinkIcon,
  FileTextIcon,
  GlobeIcon,
  LockIcon,
  NetworkIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@onirix/ui/components/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@onirix/ui/components/select";
import { Spinner } from "@onirix/ui/components/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@onirix/ui/components/table";

import { sourceKindLabel } from "@/components/source-icon";
import { PAGE_SIZES, SearchField, TablePager } from "@/components/table-pager";
import { useDebounced } from "@/hooks/use-debounced";
import { formatBytes, formatRelative } from "@/lib/format";
import { trpc } from "@/utils/trpc";

/** Indexing state reads as a tinted pill, one colour per outcome. */
const STATUS = {
  indexed: { label: "Indexed", variant: "success" },
  processing: { label: "Indexing", variant: "info" },
  pending: { label: "Queued", variant: "muted" },
  failed: { label: "Failed", variant: "destructive" },
} as const;

type Status = keyof typeof STATUS;

/**
 * How each audience reads in the table.
 *
 * Wording is about who can reach the document, not about the mechanism: an
 * admin retargeting a file needs to know the consequence, not the ACL.
 */
const VISIBILITY = {
  organization: { label: "Everyone", icon: GlobeIcon },
  teams: { label: "Teams", icon: NetworkIcon },
  private: { label: "Only me", icon: LockIcon },
} as const;

type Visibility = keyof typeof VISIBILITY;

const DEFAULT_PAGE_SIZE: (typeof PAGE_SIZES)[number] = 25;

export function DocumentsTable({
  sourceId,
  showSource = false,
  canManage,
  canDelete,
}: {
  /** Narrows to one source. Omitted, every document the caller may see. */
  sourceId?: string;
  /** Name the source in each row, for the page that lists every source's documents. */
  showSource?: boolean;
  canManage: boolean;
  canDelete: boolean;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status | "all">("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [deleting, setDeleting] = useState<{ id: string; title: string; connected: boolean } | null>(null);

  const search = useDebounced(query, 250);

  const documents = useQuery({
    ...trpc.knowledge.documentsPage.queryOptions({
      sourceId: sourceId ?? null,
      status: status === "all" ? null : status,
      query: search,
      page,
      pageSize,
    }),
    // Each filter change is a new query key; without this the table would
    // blink out to a spinner between one view and the next.
    placeholderData: keepPreviousData,
    // Indexing happens in the worker, so poll while anything on this page is in flight.
    refetchInterval: (state) => {
      const rows = state.state.data?.items;
      return rows?.some((doc) => doc.status === "pending" || doc.status === "processing") ? 3000 : false;
    },
  });

  const teams = useQuery({
    ...trpc.team.listTeams.queryOptions(),
    enabled: canManage,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.knowledge.documentsPage.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.knowledge.indexingProgress.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.connector.pathKey() });
  };

  const setVisibility = useMutation(
    trpc.knowledge.setDocumentVisibility.mutationOptions({
      onSuccess: () => {
        // Retrieval keeps enforcing the old permissions until the worker
        // rewrites the chunks, so the toast promises a change in progress
        // rather than one already in force.
        toast.success("Visibility updated. Search will reflect it shortly.");
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const retry = useMutation(
    trpc.knowledge.retryDocument.mutationOptions({
      onSuccess: () => {
        toast.success("Queued for indexing again.");
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const remove = useMutation(
    trpc.knowledge.deleteDocument.mutationOptions({
      onSuccess: () => {
        toast.success("Document removed.");
        setDeleting(null);
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  /** Any filter change puts you back on the first page: page 6 of a narrower
   *  result set is usually empty, and an empty page looks like an empty list. */
  function refine(apply: () => void) {
    apply();
    setPage(0);
  }

  const filtered = Boolean(query.trim() || status !== "all");
  const rows = documents.data?.items ?? [];
  const total = documents.data?.total ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={query}
          onChange={(next) => refine(() => setQuery(next))}
          placeholder="Search by title or address"
          className="max-w-sm"
        />
        <Select
          value={status}
          onValueChange={(value) => refine(() => setStatus(String(value) as Status | "all"))}
        >
          <SelectTrigger size="sm" aria-label="Filter by indexing state">
            <SelectValue>{status === "all" ? "Any state" : STATUS[status].label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any state</SelectItem>
            {(Object.keys(STATUS) as Status[]).map((key) => (
              <SelectItem key={key} value={key}>
                {STATUS[key].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              refine(() => {
                setQuery("");
                setStatus("all");
              })
            }
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      {documents.isPending ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <Empty variant="outline">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>{filtered ? "Nothing matches" : "No documents yet"}</EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Try a different search or clear the filters."
                : sourceId
                  ? "The first sync will list what it found here."
                  : "Upload a file or connect a source to get started."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="bg-card overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead className="w-32">State</TableHead>
                <TableHead className="w-40">Visible to</TableHead>
                <TableHead className="w-20 text-right">Chunks</TableHead>
                <TableHead className="w-28">Updated</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((doc) => {
                const state = STATUS[doc.status as Status] ?? STATUS.pending;
                return (
                  <TableRow key={doc.id}>
                    <TableCell variant="strong" className="max-w-md">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate" title={doc.title}>
                          {doc.title}
                        </span>
                        {doc.sourceUrl ? (
                          <a
                            href={doc.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open ${doc.title} at its source`}
                            className="text-ink-02 hover:text-foreground shrink-0"
                          >
                            <ExternalLinkIcon className="size-3.5" />
                          </a>
                        ) : null}
                      </span>
                      <p className="text-ink-03 truncate text-xs font-normal">
                        {[
                          showSource ? `${doc.sourceName} · ${sourceKindLabel(doc.sourceType)}` : null,
                          formatBytes(doc.sizeBytes),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={state.variant}>{state.label}</Badge>
                      {doc.status === "failed" && doc.indexError ? (
                        <p
                          className="text-destructive mt-1 max-w-48 truncate text-xs"
                          title={doc.indexError}
                        >
                          {doc.indexError}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <DocumentVisibility
                        documentId={doc.id}
                        visibility={doc.visibility}
                        teams={teams.data ?? []}
                        canManage={canManage}
                        onChange={(visibility, teamIds) =>
                          setVisibility.mutate({ documentId: doc.id, visibility, teamIds })
                        }
                      />
                    </TableCell>
                    <TableCell variant="figure" className="text-right">
                      {doc.chunkCount}
                    </TableCell>
                    <TableCell variant="muted">{formatRelative(doc.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <span className="flex items-center justify-end gap-0.5">
                        {canManage && doc.status === "failed" ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Retry indexing ${doc.title}`}
                            disabled={retry.isPending}
                            onClick={() => retry.mutate({ documentId: doc.id })}
                          >
                            <RotateCcwIcon />
                          </Button>
                        ) : null}
                        {canDelete ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${doc.title}`}
                            onClick={() =>
                              setDeleting({
                                id: doc.id,
                                title: doc.title,
                                connected: doc.sourceType !== "file_upload",
                              })
                            }
                          >
                            <Trash2Icon className="text-destructive" />
                          </Button>
                        ) : null}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <TablePager
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => refine(() => setPageSize(size))}
        isFetching={documents.isFetching && !documents.isPending}
        noun="documents"
      />

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.connected
                ? "It stops being searchable now. The next sync of its source will bring it back unless the source no longer offers it; to keep it out for good, exclude it on the source."
                : "It stops being searchable now, and the stored file is deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel render={<Button variant="outline" />}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => deleting && remove.mutate({ documentId: deleting.id })}
            >
              {remove.isPending ? <Spinner /> : null}
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * The audience control on a document row.
 *
 * Choosing "Teams" needs a team to be named, so the picker stays on screen
 * until one is. A document restricted to no team at all would silently
 * collapse to "only its uploader", which is not what the person clicking meant.
 */
function DocumentVisibility({
  documentId,
  visibility,
  teams,
  canManage,
  onChange,
}: {
  documentId: string;
  visibility: Visibility;
  teams: { id: string; name: string }[];
  canManage: boolean;
  onChange: (visibility: Visibility, teamIds: string[]) => void;
}) {
  const [pendingTeams, setPendingTeams] = useState(false);
  const current = VISIBILITY[visibility];
  const Icon = current.icon;

  if (!canManage) {
    return (
      <span className="text-ink-03 flex items-center gap-1.5 text-xs">
        <Icon className="size-3.5" />
        {current.label}
      </span>
    );
  }

  if (pendingTeams) {
    return (
      <Select
        value=""
        onValueChange={(value) => {
          setPendingTeams(false);
          onChange("teams", [String(value)]);
        }}
      >
        <SelectTrigger size="sm" aria-label="Choose a team">
          <SelectValue placeholder="Team…" />
        </SelectTrigger>
        <SelectContent>
          {teams.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              {group.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Select
      value={visibility}
      onValueChange={(value) => {
        const next = String(value) as Visibility;
        if (next === "teams") {
          if (teams.length === 0) {
            toast.error("Create a team on the Teams page first.");
            return;
          }
          setPendingTeams(true);
          return;
        }
        onChange(next, []);
      }}
    >
      <SelectTrigger size="sm" aria-label={`Visibility of ${documentId}`}>
        <SelectValue>{current.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(VISIBILITY) as Visibility[]).map((key) => (
          <SelectItem key={key} value={key}>
            {VISIBILITY[key].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
