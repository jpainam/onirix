/**
 * Settings > Documents: the whole local library in one place.
 *
 * The panel beside a conversation is where documents are used. This is where
 * they are kept: what is in the library, how much room it takes, where on the
 * disk it lives, and the way to take a file back out. A private library has to
 * be one the person can inspect and empty.
 */
import { useEffect, useRef, useState } from "react";

import { Badge } from "@onirix/ui/components/badge";
import { Button } from "@onirix/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@onirix/ui/components/input-group";
import { Spinner } from "@onirix/ui/components/spinner";
import {
  FileTextIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
} from "@onirix/ui/lib/icons";
import { cn } from "@onirix/ui/lib/utils";

import { LIMITS, type LibraryDocument } from "../src/local-bridge";

import { errorMessage, getBridge } from "./bridge";
import { Section } from "./settings-section";
import { TILE } from "./tokens";

function size(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

function added(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export function DocumentsSettings({
  library,
  onLibraryChange,
}: {
  library: LibraryDocument[];
  onLibraryChange: () => Promise<void>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storage, setStorage] = useState<{
    path: string;
    totalBytes: number;
  } | null>(null);

  // Measured again whenever the library changes: that is when it can differ.
  useEffect(() => {
    let stale = false;
    void getBridge()
      .documents.storage()
      .then((measured) => {
        if (!stale) setStorage(measured);
      });
    return () => {
      stale = true;
    };
  }, [library]);

  const query = search.trim().toLowerCase();
  const shown = library.filter(
    (row) => !query || row.title.toLowerCase().includes(query),
  );

  async function add(files: File[]) {
    if (files.length === 0 || adding) return;
    setAdding(true);
    setError(null);
    try {
      const result = await getBridge().documents.add(
        files.slice(0, LIMITS.documentsPerCall),
      );
      if (result.refused.length > 0) setError(result.refused.join(" "));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      await onLibraryChange();
      setAdding(false);
    }
  }

  async function remove(id: string) {
    await getBridge().documents.remove(id);
    await onLibraryChange();
  }

  return (
    <>
      <Section
        title="Documents"
        description="Files you have given Onirix to read. Attach them to a session from the panel beside it, and answers cite the passage behind each claim."
      >
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          accept=".pdf,.docx,.xlsx,.xls,.csv,.md,.markdown,.html,.htm,.json,.txt,.text,.log,.rst"
          onChange={(event) => {
            if (event.target.files) void add([...event.target.files]);
            event.target.value = "";
          }}
        />
        <div className="flex items-center gap-2">
          <InputGroup className="flex-1">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search documents"
              aria-label="Search your library"
            />
          </InputGroup>
          <Button
            variant="outline"
            className="rounded-full px-4"
            disabled={adding}
            onClick={() => fileInput.current?.click()}
          >
            {adding ? <Spinner /> : <UploadIcon />}
            {adding ? "Reading" : "Add files"}
          </Button>
        </div>

        {error ? (
          <p className="text-destructive text-sm select-text" role="alert">
            {error}
          </p>
        ) : null}

        {shown.length === 0 ? (
          <p className={cn("text-ink-03 px-4 py-6 text-center text-sm", TILE)}>
            {query ? "No document matches that." : "The library is empty."}
          </p>
        ) : (
          <ul className={cn("divide-y overflow-hidden", TILE)}>
            {shown.map((row) => (
              <li
                key={row.id}
                className="flex min-h-14 items-center gap-3 px-4 py-2.5"
              >
                <FileTextIcon className="text-ink-02 size-4 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm" title={row.title}>
                    {row.title}
                  </span>
                  <span className="text-ink-03 truncate text-xs">
                    {row.status === "failed"
                      ? (row.error ?? "This file could not be read.")
                      : `${size(row.sizeBytes)}, ${row.chunkCount} ${row.chunkCount === 1 ? "passage" : "passages"}, added ${added(row.addedAt)}`}
                  </span>
                </div>
                {row.status === "failed" ? (
                  <Badge variant="destructive">Failed</Badge>
                ) : null}
                {row.status === "processing" ? (
                  <Badge variant="muted">
                    <Spinner /> Reading
                  </Badge>
                ) : null}
                {/* Asks nothing first: the original file is untouched, so
                    this only undoes an "add". */}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${row.title} from your library`}
                  onClick={() => void remove(row.id)}
                >
                  <Trash2Icon className="text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Storage">
        <div className={cn("divide-y", TILE)}>
          <div className="flex min-h-14 items-center gap-4 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm">
                {library.length}{" "}
                {library.length === 1 ? "document" : "documents"}
                {storage
                  ? `, ${size(storage.totalBytes)} on this computer`
                  : ""}
              </span>
              <span
                className="text-ink-03 truncate font-mono text-xs select-text"
                title={storage?.path}
              >
                {storage?.path ?? ""}
              </span>
            </div>
            <Button
              variant="outline"
              className="rounded-full px-4"
              onClick={() => void getBridge().app.openDataFolder()}
            >
              Open the folder
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
