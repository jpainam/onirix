"use client";

import { useQuery } from "@tanstack/react-query";
import { UploadIcon } from "@onirix/ui/lib/icons";

import { Button } from "@onirix/ui/components/button";
import { Spinner } from "@onirix/ui/components/spinner";

import { Page, PageHeader } from "@/components/page";
import { formatCount } from "@/lib/format";
import { trpc } from "@/utils/trpc";

import { DocumentsTable } from "../sources/documents-table";
import { useUpload } from "../sources/use-upload";

/**
 * Documents: everything the workspace has indexed, and the way to add a file
 * by hand. Where a document came from is Sources' business; this page is the
 * library itself, as it is in the desktop app with no server.
 */
export function DocumentsView({
  canManage,
  canDelete,
}: {
  canManage: boolean;
  canDelete: boolean;
}) {
  const files = useUpload();

  const progress = useQuery({
    ...trpc.knowledge.indexingProgress.queryOptions(),
    refetchInterval: (state) => ((state.state.data?.pending ?? 0) > 0 ? 3000 : false),
  });
  const summary = progress.data;

  return (
    <Page wide>
      <PageHeader
        title="Documents"
        description={
          summary && summary.total > 0
            ? `${formatCount(summary.indexed)} of ${formatCount(summary.total)} indexed${
                summary.pending > 0 ? ` · ${formatCount(summary.pending)} in progress` : ""
              }${summary.failed > 0 ? ` · ${formatCount(summary.failed)} failed` : ""}. From every source; search by title or address.`
            : "Everything indexed, from every source. Search by title or address."
        }
        // Anyone in the workspace may add a file, here as from a chat.
        action={
          <Button variant="outline" onClick={files.pick} disabled={files.uploading}>
            {files.uploading ? <Spinner /> : <UploadIcon />}
            Add files
          </Button>
        }
      />
      {files.input}
      <DocumentsTable showSource canManage={canManage} canDelete={canDelete} />
    </Page>
  );
}
