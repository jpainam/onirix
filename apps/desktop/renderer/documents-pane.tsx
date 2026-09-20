/**
 * The documents this conversation reads, and the way more are added. The
 * dashboard's pane (`apps/dashboard/.../chat/documents-pane.tsx`), over the
 * library on this computer instead of a workspace.
 *
 * Two ways in, on purpose. Adding a file copies it into the library and
 * attaches it here; picking attaches one that is already in the library, which
 * is how a file added once is reused instead of added again.
 */
import { FileTextIcon, PlusIcon, SearchIcon, Trash2Icon, UploadIcon, XIcon } from "@onirix/ui/lib/icons";
import { type DragEvent, useRef, useState } from "react";

import { Badge } from "@onirix/ui/components/badge";
import { Button } from "@onirix/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@onirix/ui/components/input-group";
import { Spinner } from "@onirix/ui/components/spinner";
import { cn } from "@onirix/ui/lib/utils";

import type { LibraryDocument } from "../src/local-bridge";

/** How many library documents the picker offers before it asks for a search. */
const PICKER_LIMIT = 20;

function StatusBadge({ document }: { document: LibraryDocument }) {
  if (document.status === "indexed") return null;
  if (document.status === "failed") {
    return (
      <Badge variant="destructive" title={document.error ?? undefined}>
        Failed
      </Badge>
    );
  }
  return (
    <Badge variant="muted">
      <Spinner />
      Reading
    </Badge>
  );
}

export function DocumentsPane({
  attached,
  library,
  adding,
  error,
  onAdd,
  onAttach,
  onDetach,
  onDelete,
}: {
  /** In this session, in the order they were attached. */
  attached: LibraryDocument[];
  /** Everything in the library, newest first. */
  library: LibraryDocument[];
  adding: boolean;
  /** Why the last add was refused, as a sentence. */
  error: string | null;
  onAdd: (files: File[]) => void;
  onAttach: (document: LibraryDocument) => void;
  onDetach: (documentId: string) => void;
  /** Removes the library's copy for good. The original file is not touched. */
  onDelete: (documentId: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [dropping, setDropping] = useState(false);

  const attachedIds = new Set(attached.map((row) => row.id));
  const query = search.trim().toLowerCase();
  const available = library
    .filter((row) => !attachedIds.has(row.id))
    .filter((row) => !query || row.title.toLowerCase().includes(query))
    .slice(0, PICKER_LIMIT);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDropping(false);
    if (event.dataTransfer.files.length > 0) onAdd([...event.dataTransfer.files]);
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      onDragOver={(event) => {
        event.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={handleDrop}
    >
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept=".pdf,.docx,.xlsx,.xls,.csv,.md,.markdown,.html,.htm,.json,.txt,.text,.log,.rst"
        onChange={(event) => {
          if (event.target.files) onAdd([...event.target.files]);
          event.target.value = "";
        }}
      />

      <section className="flex flex-col gap-2 p-4">
        <h3 className="text-ink-02 text-xs font-medium">In this session</h3>

        {attached.length === 0 ? (
          <p className="text-ink-03 text-sm">Answers cite the documents you attach.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {attached.map((row) => (
              <li
                key={row.id}
                className="bg-tint-01 flex h-9 items-center gap-2 rounded-lg pr-1 pl-2.5"
              >
                <FileTextIcon className="text-ink-02 size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm" title={row.title}>
                  {row.title}
                </span>
                <StatusBadge document={row} />
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

        {attached.some((row) => row.status === "failed") ? (
          <p className="text-destructive text-xs select-text">
            {attached.find((row) => row.status === "failed")?.error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={adding}
          onClick={() => fileInput.current?.click()}
          className={cn(
            "text-ink-03 hover:bg-tint-01 hover:text-ink-04 mt-1 flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed text-sm transition-colors disabled:opacity-60 motion-reduce:transition-none",
            dropping && "bg-tint-01 border-ring text-ink-04 border-solid",
          )}
        >
          {adding ? <Spinner /> : <UploadIcon className="size-4" />}
          {adding ? "Reading" : "Drop or browse files"}
        </button>
        <p className="text-ink-02 text-xs">PDF, Word, Excel or text, up to 50 MB.</p>

        {error ? (
          <p className="text-destructive text-sm select-text" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <section className="flex min-h-0 flex-col gap-2 border-t p-4">
        <h3 className="text-ink-02 text-xs font-medium">From your library</h3>

        <InputGroup>
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

        {available.length === 0 ? (
          <p className="text-ink-03 text-sm">{query ? "No matches." : "Nothing else yet."}</p>
        ) : (
          <ul className="flex flex-col">
            {available.map((row) => (
              <li key={row.id} className="group/pick relative">
                <button
                  type="button"
                  onClick={() => onAttach(row)}
                  className="hover:bg-tint-01 flex h-9 w-full items-center gap-2 rounded-lg pr-9 pl-2.5 text-left transition-colors motion-reduce:transition-none"
                >
                  <FileTextIcon className="text-ink-02 size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm" title={row.title}>
                    {row.title}
                  </span>
                  <StatusBadge document={row} />
                  <PlusIcon className="text-ink-02 size-4 shrink-0 opacity-0 transition-opacity group-hover/pick:opacity-100 group-focus-within/pick:opacity-100 motion-reduce:transition-none" />
                </button>
                {/* A library on someone's own computer has to be something they
                    can take a file back out of. The original is untouched, so
                    this asks nothing first. */}
                <Button
                  variant="muted"
                  size="icon-xs"
                  aria-label={`Delete ${row.title} from your library`}
                  onClick={() => onDelete(row.id)}
                  className="absolute top-1.5 right-1.5 opacity-0 group-hover/pick:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
