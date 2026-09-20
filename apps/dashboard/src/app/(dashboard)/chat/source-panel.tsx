"use client";

import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon } from "@onirix/ui/lib/icons";

import { Button } from "@onirix/ui/components/button";

import type { CitedSource } from "@/lib/chat-message";

/** `file_upload` → `File upload`, for the one line of provenance a reader needs. */
function formatSourceType(sourceType: string): string {
  const spaced = sourceType.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The passage behind a citation, as one pane of the panel beside the answer.
 *
 * Beside rather than over: the point of inspecting a citation is to read the
 * passage against the sentence that cited it, which an overlay would cover.
 */
export function SourcePane({
  source,
  siblings,
  onSelect,
}: {
  source: CitedSource | null;
  /** The other sources cited by the same answer, for stepping through them. */
  siblings: CitedSource[];
  onSelect: (source: CitedSource) => void;
}) {
  if (!source) {
    return (
      <p className="text-ink-03 p-4 text-sm leading-6">
        Select a citation in an answer to read the passage behind it.
      </p>
    );
  }

  const position = siblings.findIndex((candidate) => candidate.index === source.index);
  const previous = position > 0 ? siblings[position - 1] : undefined;
  const next = position >= 0 ? siblings[position + 1] : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start gap-2 border-b p-4">
        <span className="bg-tint-02 text-ink-03 mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded font-mono text-xs leading-none">
          {source.index}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium" title={source.title}>
            {source.title}
          </h3>
          <p className="text-ink-03 text-xs">
            {formatSourceType(source.sourceType)}
            {source.updatedAt ? ` · Updated ${source.updatedAt}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          <Button
            variant="muted"
            size="icon-xs"
            aria-label="Previous source"
            disabled={!previous}
            onClick={() => previous && onSelect(previous)}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="muted"
            size="icon-xs"
            aria-label="Next source"
            disabled={!next}
            onClick={() => next && onSelect(next)}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="text-ink-02 mb-2 text-xs font-medium">Cited passage</p>
        <p className="text-ink-04 text-sm leading-6 whitespace-pre-wrap">
          {source.passage}
        </p>
      </div>

      <footer className="flex items-center border-t px-4 py-2.5">
        {source.url ? (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="text-info inline-flex items-center gap-1.5 text-xs hover:underline"
          >
            Open original
            <ExternalLinkIcon className="size-3.5" />
          </a>
        ) : (
          <span className="text-ink-02 text-xs">
            This source has no link to an original.
          </span>
        )}
      </footer>
    </div>
  );
}
