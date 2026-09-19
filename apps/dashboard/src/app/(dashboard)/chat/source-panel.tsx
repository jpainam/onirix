"use client";

import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@onirix/ui/lib/utils";

import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactClose,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@onirix/ui/components/ai-elements/artifact";
import type { CitedSource } from "@/lib/chat-message";

/** `file_upload` → `File upload`, for the one line of provenance a reader needs. */
function formatSourceType(sourceType: string): string {
  const spaced = sourceType.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The passage behind a citation, in a panel beside the answer.
 *
 * It slides in alongside the conversation rather than over it — the point of
 * inspecting a citation is to read the passage against the sentence that cited
 * it, which a modal overlay would cover.
 */
export function SourcePanel({
  source,
  siblings,
  onSelect,
  onClose,
}: {
  source: CitedSource | null;
  /** The other sources cited by the same answer, for stepping through them. */
  siblings: CitedSource[];
  onSelect: (source: CitedSource) => void;
  onClose: () => void;
}) {
  // The outgoing passage stays mounted while the panel slides away; dropping it
  // the instant it closes would blank the panel out mid-animation.
  const [lastShown, setLastShown] = useState(source);
  useEffect(() => {
    if (source) setLastShown(source);
  }, [source]);

  const shown = source ?? lastShown;
  const position = shown
    ? siblings.findIndex((candidate) => candidate.index === shown.index)
    : -1;
  const previous = position > 0 ? siblings[position - 1] : undefined;
  const next = position >= 0 ? siblings[position + 1] : undefined;

  return (
    <aside
      data-open={source !== null}
      // `inert` rather than `aria-hidden`: a closed panel still holds focusable
      // buttons, and hiding them from assistive tech without removing them from
      // the tab order is worse than doing neither.
      inert={source === null}
      className="
        relative h-full w-0 max-w-96 shrink-0 overflow-hidden
        transition-all duration-300 ease-out data-[open=true]:w-screen
      "
    >
      {/* Held at its full width inside the clipping parent, so the passage does
          not reflow line by line while the panel opens. */}
      <div
        className={cn(
          "absolute inset-y-0 right-0 w-screen max-w-96 p-3 transition-transform duration-300 ease-out",
          source ? "translate-x-0" : "translate-x-full",
        )}
      >
        {shown ? (
          <Artifact className="h-full">
            <ArtifactHeader>
              <div className="flex min-w-0 items-start gap-2">
                <span
                  className="bg-tint-02 text-ink-03 mt-0.5 inline-flex size-5 shrink-0 items-center
                             justify-center rounded font-mono text-xs leading-none"
                >
                  {shown.index}
                </span>
                <div className="min-w-0">
                  <ArtifactTitle>{shown.title}</ArtifactTitle>
                  <ArtifactDescription>
                    {formatSourceType(shown.sourceType)}
                    {shown.updatedAt ? ` \u00b7 Updated ${shown.updatedAt}` : ""}
                  </ArtifactDescription>
                </div>
              </div>

              <ArtifactActions>
                <ArtifactAction
                  icon={ChevronLeftIcon}
                  tooltip="Previous source"
                  disabled={!previous}
                  onClick={() => previous && onSelect(previous)}
                />
                <ArtifactAction
                  icon={ChevronRightIcon}
                  tooltip="Next source"
                  disabled={!next}
                  onClick={() => next && onSelect(next)}
                />
                <ArtifactClose onClick={onClose} />
              </ArtifactActions>
            </ArtifactHeader>

            <ArtifactContent>
              <p className="text-ink-02 mb-2 text-xs font-medium tracking-wide uppercase">
                Cited passage
              </p>
              <p className="text-ink-04 text-sm leading-6 whitespace-pre-wrap">
                {shown.passage}
              </p>
            </ArtifactContent>

            <div className="flex items-center border-t px-4 py-2.5">
              {shown.url ? (
                <a
                  href={shown.url}
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
            </div>
          </Artifact>
        ) : null}
      </div>
    </aside>
  );
}
