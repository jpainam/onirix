"use client";

import { useMemo, type ComponentProps } from "react";
import { defaultRemarkPlugins, Streamdown, type Components } from "streamdown";

import { cn } from "@onirix/ui/lib/utils";

import {
  Sources,
  SourcesContent,
  SourcesTrigger,
  SourceButton,
} from "@onirix/ui/components/ai-elements/sources";
import {
  getCitedSources,
  getMessageText,
  getRetrievedSources,
  isChartPart,
  type ChartPart,
  type CitedSource,
  type OnirixUIMessage,
} from "@/lib/chat-message";

import { ChartMessagePart } from "./chart";
import { CITATION_ATTRIBUTE, remarkCitations } from "./citations";

/**
 * Renders an answer, turning inline `[1]` markers into citation chips and
 * listing the documents behind them underneath.
 *
 * PRODUCT.md treats citations as central to trusting Onirix, so a marker is a
 * real affordance rather than literal text in the prose: selecting one reveals
 * the passage it came from.
 *
 * The answer is walked part by part rather than flattened to one string, so a
 * chart appears where the model drew it — between the paragraph that sets it up
 * and the one that reads it — instead of being swept to the end of the turn.
 */
export function AnswerWithCitations({
  message,
  onSelectSource,
  activeIndex,
}: {
  message: OnirixUIMessage;
  onSelectSource: (source: CitedSource) => void;
  activeIndex: number | null;
}) {
  // Recomputed per streamed chunk, but held steady across re-renders that only
  // move the open citation — which is what keeps the markdown memo effective.
  const cited = useMemo(() => getCitedSources(message), [message]);
  // Charts resolve against everything retrieved, not just what the prose cited:
  // a chart may be the only thing in the turn referring to its document.
  const retrieved = useMemo(() => getRetrievedSources(message), [message]);

  // Consecutive text parts are merged so a paragraph split across stream chunks
  // stays one markdown block; a chart closes the run it interrupts.
  const blocks = useMemo(() => {
    const out: (
      | { kind: "text"; text: string }
      | { kind: "chart"; part: ChartPart }
    )[] = [];

    for (const part of message.parts) {
      if (part.type === "text") {
        const last = out.at(-1);
        if (last?.kind === "text") last.text += part.text;
        else out.push({ kind: "text", text: part.text });
      } else if (isChartPart(part)) {
        out.push({ kind: "chart", part });
      }
    }
    return out;
  }, [message.parts]);

  const components = useMemo<Components>(
    () => ({
      // `node` and `ref` are react-markdown's own plumbing; neither belongs on
      // the element, and `ref` is typed loosely enough to reject `<sup>`.
      sup: ({ node: _node, ref: _ref, ...props }) => {
        const raw = (props as Record<string, unknown>)[CITATION_ATTRIBUTE];
        // A genuine `<sup>` from the document, not a marker we inserted.
        if (typeof raw !== "string") return <sup {...props} />;

        const index = Number.parseInt(raw, 10);
        const source = cited.find((candidate) => candidate.index === index);

        // The model can cite a number retrieval never produced. Showing it as
        // plain text is honest; a dead button is not.
        if (!source) {
          return <span className="text-ink-02">{props.children}</span>;
        }

        return (
          <CitationChip
            source={source}
            active={activeIndex === index}
            onSelect={onSelectSource}
          />
        );
      },
    }),
    [activeIndex, cited, onSelectSource],
  );

  const remarkPlugins = useMemo(
    // Passing `remarkPlugins` replaces Streamdown's defaults rather than adding
    // to them, so GFM has to be carried along explicitly.
    () => [...Object.values(defaultRemarkPlugins), remarkCitations],
    [],
  );

  return (
    <>
      {blocks.map((block, i) =>
        block.kind === "chart" ? (
          <ChartMessagePart
            key={`chart-${block.part.toolCallId}`}
            part={block.part}
            sources={retrieved}
            onSelectSource={onSelectSource}
          />
        ) : (
          <Prose
            key={`text-${i}`}
            text={block.text}
            components={components}
            remarkPlugins={remarkPlugins}
          />
        ),
      )}

      {cited.length > 0 ? (
        <SourceList
          sources={cited}
          activeIndex={activeIndex}
          onSelectSource={onSelectSource}
        />
      ) : null}
    </>
  );
}

/**
 * One run of prose between charts.
 *
 * Split out so each run memoises on its own text: a chart landing mid-answer
 * must not invalidate the markdown above it.
 */
function Prose({
  text,
  components,
  remarkPlugins,
}: {
  text: string;
  components: Components;
  remarkPlugins: ComponentProps<typeof Streamdown>["remarkPlugins"];
}) {
  return (
    /* The markdown is styled here rather than in a `prose` preset so the type
       scale matches the rest of the app instead of a typography plugin's. */
    <>
      {/* Streamdown directly rather than ai-elements' `MessageResponse`: that
          wrapper memoises on `children` alone, so it would not re-render when
          the open citation changes and the highlight would go stale. */}
      <Streamdown
        className="
          [&_a]:text-info [&_a]:underline [&_a]:underline-offset-2
          [&_code]:bg-tint-02 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs
          [&_h1]:mt-6 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold
          [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold
          [&_h3]:mt-5 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold
          [&_li]:my-1
          [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5
          [&_p]:my-3 first:[&_p]:mt-0 last:[&_p]:mb-0
          [&_pre]:bg-tint-01 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:p-3
          [&_pre_code]:bg-transparent [&_pre_code]:p-0
          [&_table]:my-3 [&_table]:w-full [&_table]:text-left
          [&_td]:border-t [&_td]:py-1.5 [&_th]:py-1.5 [&_th]:font-semibold
          [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5
          [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-ink-03
        "
        components={components}
        remarkPlugins={remarkPlugins}
      >
        {text}
      </Streamdown>
    </>
  );
}

/** The user's own message: plain text, never markdown or citations. */
export function UserMessage({ message }: { message: OnirixUIMessage }) {
  return <p className="whitespace-pre-wrap">{getMessageText(message)}</p>;
}

function CitationChip({
  source,
  active,
  onSelect,
}: {
  source: CitedSource;
  active: boolean;
  onSelect: (source: CitedSource) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(source)}
      title={source.title}
      aria-label={`Show the passage cited from ${source.title}`}
      className={cn(
        `ml-0.5 inline-flex size-4 items-center justify-center rounded align-middle
         font-mono text-xs leading-none transition-colors`,
        active
          ? "bg-info text-white"
          : "bg-tint-02 text-ink-03 hover:bg-tint-03 hover:text-ink-04",
      )}
    >
      {source.index}
    </button>
  );
}

/**
 * The trailing source list PRODUCT.md specifies, so the basis of an answer is
 * legible without hunting for markers in the prose. Open by default — leaving
 * the sources behind a closed disclosure is what made them invisible.
 */
function SourceList({
  sources,
  activeIndex,
  onSelectSource,
}: {
  sources: CitedSource[];
  activeIndex: number | null;
  onSelectSource: (source: CitedSource) => void;
}) {
  return (
    /* The Collapsible owns none of this: type scale and the rule above the
       list belong to the answer, not to the design-system component. */
    <div className="text-ink-03 mt-4 border-t pt-3 text-xs">
      <Sources defaultOpen>
        <SourcesTrigger count={sources.length} />
        <SourcesContent>
          {sources.map((source) => (
            <SourceButton
              key={source.index}
              title={source.title}
              onClick={() => onSelectSource(source)}
              aria-label={`Show the passage cited from ${source.title}`}
              variant={activeIndex === source.index ? "active" : "default"}
            >
              <span
                className="bg-tint-02 text-ink-03 inline-flex size-4 shrink-0 items-center
                           justify-center rounded font-mono leading-none"
              >
                {source.index}
              </span>
              <span className="truncate">{source.title}</span>
            </SourceButton>
          ))}
        </SourcesContent>
      </Sources>
    </div>
  );
}
