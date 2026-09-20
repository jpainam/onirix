"use client";

import {
  EyeIcon,
  FileTextIcon,
  FolderPlusIcon,
  PlusIcon,
  SearchIcon,
  UploadIcon,
  XIcon,
} from "@onirix/ui/lib/icons";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useRef, useState, type DragEvent } from "react";

import { Badge } from "@onirix/ui/components/badge";
import { Button } from "@onirix/ui/components/button";
import { useFolderPicker } from "@onirix/ui/components/folder-picker";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@onirix/ui/components/input-group";
import { Spinner } from "@onirix/ui/components/spinner";
import { readDrop } from "@onirix/ui/lib/folder-files";
import { cn } from "@onirix/ui/lib/utils";

import { trpc } from "@/utils/trpc";

import type { SessionDocument } from "./use-session-documents";

/** How many workspace documents the picker offers before it asks for a search. */
const PICKER_LIMIT = 20;

function StatusBadge({ status }: { status: SessionDocument["status"] }) {
  if (status === "indexed") return null;
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  return (
    <Badge variant="muted">
      <Spinner />
      Reading
    </Badge>
  );
}

/**
 * The documents this conversation reads first, and the way more are added.
 *
 * Two ways in, on purpose. Uploading adds a file to the workspace and attaches
 * it here; picking attaches one that is already in the workspace, which is how
 * a file uploaded once is reused instead of uploaded again. Both lists only
 * ever hold what this reader is allowed to see.
 *
 * A folder, picked or dropped, is shown first and uploaded second: the reader
 * chooses which of its files go in.
 *
 * Either kind of row can also be opened and read. In the workspace list that
 * is a separate control, because the row itself already means "attach".
 */
export function DocumentsPane({
  documents,
  uploading,
  onUpload,
  onAttach,
  onDetach,
  onPreview,
}: {
  documents: SessionDocument[];
  uploading: boolean;
  onUpload: (files: FileList | File[]) => void;
  onAttach: (document: SessionDocument) => void;
  onDetach: (documentId: string) => void;
  onPreview: (document: { id: string; title: string }) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [dropping, setDropping] = useState(false);
  // Typing should not fire a request per keystroke.
  const query = useDeferredValue(search.trim());

  const library = useQuery(
    trpc.knowledge.listDocuments.queryOptions({
      query: query || null,
      limit: PICKER_LIMIT,
    }),
  );

  const attachedIds = new Set(documents.map((row) => row.id));
  const available = (library.data ?? []).filter(
    (row) => !attachedIds.has(row.id),
  );

  const folder = useFolderPicker({ onConfirm: onUpload });

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDropping(false);
    const dropped = await readDrop(event.dataTransfer);
    if (dropped.files.length > 0) onUpload(dropped.files);
    folder.review(dropped.folders);
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      onDragOver={(event) => {
        event.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(event) => void handleDrop(event)}
    >
      {folder.element}
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files) onUpload(event.target.files);
          event.target.value = "";
        }}
      />

      <section className="flex flex-col gap-2 p-4">
        <h3 className="text-ink-02 text-xs font-medium">In this session</h3>

        {documents.length === 0 ? (
          <p className="text-ink-03 text-sm leading-6">
            Attach documents and answers will read them first.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {documents.map((row) => (
              <li
                key={row.id}
                className="group/row bg-tint-01 flex h-9 items-center gap-2 rounded-lg pr-1 pl-2.5"
              >
                <button
                  type="button"
                  onClick={() => onPreview(row)}
                  title={row.title}
                  className="hover:text-ink-05 flex min-w-0 flex-1 items-center gap-2 self-stretch text-left transition-colors"
                >
                  <FileTextIcon className="text-ink-02 size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {row.title}
                  </span>
                </button>
                <StatusBadge status={row.status} />
                <Button
                  variant="muted"
                  size="icon-xs"
                  aria-label={`Remove ${row.title} from this session`}
                  onClick={() => onDetach(row.id)}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
          className={cn(
            "text-ink-03 hover:bg-tint-01 hover:text-ink-04 mt-1 flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed text-sm transition-colors disabled:opacity-60",
            dropping && "bg-tint-01 border-ring text-ink-04 border-solid",
          )}
        >
          {uploading ? <Spinner /> : <UploadIcon className="size-4" />}
          {uploading ? "Uploading" : "Drop files or a folder, or browse"}
        </button>
        <Button
          variant="muted"
          size="sm"
          disabled={uploading}
          onClick={folder.pick}
          className="self-start"
        >
          <FolderPlusIcon />
          Add a folder
        </Button>
      </section>

      <section className="flex min-h-0 flex-col gap-2 border-t p-4">
        <h3 className="text-ink-02 text-xs font-medium">From your workspace</h3>

        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search documents"
            aria-label="Search workspace documents"
          />
        </InputGroup>

        {library.isPending ? (
          <div className="text-ink-03 flex h-9 items-center gap-2 text-sm">
            <Spinner />
            Loading
          </div>
        ) : available.length === 0 ? (
          <p className="text-ink-03 text-sm leading-6">
            {query
              ? "No document matches that."
              : "Nothing else here yet. Files you upload can be reused in any session."}
          </p>
        ) : (
          <ul className="flex flex-col">
            {available.map((row) => (
              <li
                key={row.id}
                className="group/pick hover:bg-tint-01 flex h-9 items-center rounded-lg pr-1 transition-colors"
              >
                <button
                  type="button"
                  onClick={() =>
                    onAttach({
                      id: row.id,
                      title: row.title,
                      status: row.status,
                    })
                  }
                  className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-lg pl-2.5 text-left"
                >
                  <FileTextIcon className="text-ink-02 size-4 shrink-0" />
                  <span
                    className="min-w-0 flex-1 truncate text-sm"
                    title={row.title}
                  >
                    {row.title}
                  </span>
                  <PlusIcon className="text-ink-02 size-4 shrink-0 opacity-0 transition-opacity group-focus-within/pick:opacity-100 group-hover/pick:opacity-100" />
                </button>
                <span className="opacity-0 transition-opacity group-focus-within/pick:opacity-100 group-hover/pick:opacity-100">
                  <Button
                    variant="muted"
                    size="icon-sm"
                    aria-label={`Preview ${row.title}`}
                    title="Preview"
                    onClick={() => onPreview({ id: row.id, title: row.title })}
                  >
                    <EyeIcon />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
