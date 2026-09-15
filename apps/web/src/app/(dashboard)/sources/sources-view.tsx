"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileTextIcon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@onirix/ui/components/badge";
import { Button } from "@onirix/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@onirix/ui/components/card";
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

import { trpc } from "@/utils/trpc";

const STATUS_VARIANT = {
  indexed: "default",
  processing: "secondary",
  pending: "secondary",
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

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload files</CardTitle>
          <CardDescription>
            PDF, Word, Excel, CSV, Markdown, HTML, and plain text. Uploaded files become
            part of your organization&apos;s knowledge.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(event) => void upload(event.target.files)}
          />
          <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
            {uploading ? <Spinner /> : <UploadIcon />}
            Choose files
          </Button>

          {progress.data && progress.data.total > 0 ? (
            <p className="text-muted-foreground text-sm">
              {progress.data.indexed} of {progress.data.total} documents processed
              {progress.data.failed > 0 ? ` · ${progress.data.failed} failed` : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>Everything Onirix currently knows about.</CardDescription>
        </CardHeader>
        <CardContent>
          {documents.isPending ? (
            <Spinner />
          ) : documents.data?.length === 0 ? (
            <Empty>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Chunks</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.data?.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <span className="font-medium">{doc.title}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[doc.status] ?? "secondary"}>
                        {doc.status}
                      </Badge>
                      {doc.indexError ? (
                        <p className="text-destructive mt-1 text-xs">{doc.indexError}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>{doc.chunkCount}</TableCell>
                    <TableCell>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
