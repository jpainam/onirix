/**
 * The passage behind a citation, as one pane of the panel beside the answer.
 * The dashboard's pane (`apps/dashboard/.../chat/source-panel.tsx`), for a
 * source that is a file on this computer.
 *
 * Beside rather than over: the point of inspecting a citation is to read the
 * passage against the sentence that cited it, which an overlay would cover.
 */
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon } from "@onirix/ui/lib/icons";

import { Button } from "@onirix/ui/components/button";

import type { MessageSource } from "../src/local-bridge";

export function SourcePane({
  source,
  siblings,
  onSelect,
  onPreview,
}: {
  source: MessageSource | null;
  /** The other sources cited by the same answer, for stepping through them. */
  siblings: MessageSource[];
  onSelect: (source: MessageSource) => void;
  /** Opens the whole document the passage was taken from. */
  onPreview: (document: { id: string; title: string }) => void;
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
            {source.location ? `${source.location}, from your library` : "From your library"}
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
        <p className="text-ink-04 text-sm leading-6 whitespace-pre-wrap select-text">
          {source.passage}
        </p>
      </div>

      <footer className="flex flex-col gap-2 border-t px-4 py-2.5">
        <button
          type="button"
          onClick={() => onPreview({ id: source.documentId, title: source.title })}
          className="text-info inline-flex items-center gap-1.5 self-start text-xs hover:underline"
        >
          <EyeIcon className="size-3.5" />
          View document
        </button>
        <span className="text-ink-02 text-xs">
          The file stays on this computer. Only the passages an answer reads are shown to the
          model.
        </span>
      </footer>
    </div>
  );
}
