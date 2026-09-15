"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseIcon, FileTextIcon, UploadIcon } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@onirix/ui/components/table";

import { Page, PageHeader, Row, Section } from "@/components/page";
import { trpc } from "@/utils/trpc";

/** Indexing state reads as a tinted pill, one colour per outcome. */
const STATUS_VARIANT = {
  indexed: "success",
  processing: "info",
  pending: "muted",
  failed: "destructive",
} as const;

export function SourcesView() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const documents = useQuery({
    ...trpc.knowledge.listDocuments.queryOptions({ limit: 50 }),
    // Indexing happens in the worker, so poll while anything is in flight.
    refetchInterval: (query) => {
      const rows = query.state.data as { status: string }[] | undefined;
      return rows?.some((doc) => doc.status === "pending" || doc.status === "processing")
        ? 2000
        : false;
    },
  });

  const progress = useQuery({
    ...trpc.knowledge.indexingProgress.queryOptions(),
    refetchInterval: (query) => {
      const summary = query.state.data as { pending: number } | undefined;
      return (summary?.pending ?? 0) > 0 ? 2000 : false;
    },
  });

  const retry = useMutation(
    trpc.knowledge.retryDocument.mutationOptions({
      onSuccess: () => {
        toast.success("Re-queued for indexing.");
        void queryClient.invalidateQueries();
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
        toast.success(
          `Uploaded ${result.accepted.length} file(s). Onirix is indexing them now.`,
        );
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

  return (
    <Page width="wide">
      <PageHeader
        icon={DatabaseIcon}
        title="Sources"
        description="Everything Onirix indexes, and where it came from."
        action={
          <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
            {uploading ? <Spinner /> : <UploadIcon />}
            Add files
          </Button>
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
        <Section>
          <Row
            icon={<UploadIcon />}
            title="Upload files"
            description="PDF, Word, Excel, CSV, Markdown, HTML, and plain text."
            action={
              summary && summary.total > 0 ? (
                <span className="font-figure text-ink-03">
                  {summary.indexed}/{summary.total} processed
                  {summary.failed > 0 ? ` · ${summary.failed} failed` : ""}
                </span>
              ) : null
            }
          />
        </Section>

        <Section
          title="Documents"
          description="Everything Onirix currently knows about."
        >
          {documents.isPending ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : documents.data?.length === 0 ? (
            <Empty variant="outline">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileTextIcon />
                </EmptyMedia>
                <EmptyTitle>No documents yet</EmptyTitle>
                <EmptyDescription>
                  Upload a file to give Onirix something to learn from.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="bg-card overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead className="w-40">Status</TableHead>
                    <TableHead className="w-24 text-right">Chunks</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.data?.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell variant="strong">{doc.title}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[doc.status] ?? "muted"}>
                          {doc.status}
                        </Badge>
                        {doc.indexError ? (
                          <p className="text-destructive mt-1 text-xs">
                            {doc.indexError}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell variant="figure" className="text-right">
                        {doc.chunkCount}
                      </TableCell>
                      <TableCell className="text-right">
                        {doc.status === "failed" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => retry.mutate({ documentId: doc.id })}
                          >
                            Retry
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {documents.data && documents.data.length > 0 ? (
            <p className="font-figure text-ink-02">
              Showing 1~{documents.data.length} of {documents.data.length} documents
            </p>
          ) : null}
        </Section>
      </div>
    </Page>
  );
}
