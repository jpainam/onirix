/**
 * Renders an answer as markdown, turning inline `[1]` markers into citation
 * chips and listing the documents behind them underneath, the way the
 * dashboard does (`apps/dashboard/.../chat/answer.tsx`).
 *
 * A marker is a real affordance rather than literal text in the prose:
 * selecting one opens the passage it came from, beside the answer. That is the
 * product, with a server or without one: not "the model says so" but "here is
 * where your document says so".
 */
import { code } from "@streamdown/code";
import { createContext, useContext, useMemo } from "react";
import { type Components, defaultRemarkPlugins, Streamdown } from "streamdown";

import {
  SourceButton,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@onirix/ui/components/ai-elements/sources";
import { cn } from "@onirix/ui/lib/utils";

import type { MessageSource } from "../src/local-bridge";

import { CITATION_ATTRIBUTE, citedIndices, remarkCitations } from "./citations";

// Held at module scope so the references are stable and the memoised markdown
// is not invalidated on every render.
const plugins = { code };

// Passing `remarkPlugins` replaces Streamdown's defaults rather than adding to
// them, so GFM has to be carried along explicitly.
const remarkPlugins = [...Object.values(defaultRemarkPlugins), remarkCitations];

// Streamdown sanitises the rendered tree, and by default that strips the
// attribute the citation pass puts on its `<sup>`, leaving a superscript "[1]"
// that is not a button. The attribute is named both ways because it is
// `data-citation` going into the HTML round trip and `dataCitation` coming out.
const allowedTags = { sup: ["dataCitation", CITATION_ATTRIBUTE] };

// Copy stays; "download" goes. A download from this page would be the only
// thing in local mode that writes outside the app's own folder, and a code
// block is short enough to copy.
const controls = {
  code: { copy: true, download: false },
  table: { copy: true, download: false },
  image: false,
};

export function Answer({
  text,
  streaming,
  sources,
  activeIndex,
  onSelectSource,
}: {
  text: string;
  streaming: boolean;
  /** Every passage the answer was given, cited or not. */
  sources: MessageSource[];
  /** The source open in the panel, when it belongs to this answer. */
  activeIndex: number | null;
  onSelectSource: (source: MessageSource) => void;
}) {
  // Only what the prose refers to is listed: six passages were read, and an
  // answer that used two should not look as if it rests on six.
  const cited = useMemo(() => {
    const indices = citedIndices(text);
    return sources.filter((source) => indices.has(source.index));
  }, [text, sources]);

  const citations = useMemo(
    () => ({ sources, activeIndex, onSelectSource }),
    [sources, activeIndex, onSelectSource],
  );

  return (
    <CitationContext.Provider value={citations}>
      {/* Styled here rather than with a `prose` preset so the type scale
          matches the rest of the app, and the dashboard's answers, exactly. */}
      <Streamdown
        className="
          select-text
          [&_a]:text-info [&_a]:underline [&_a]:underline-offset-2
          [&_code]:bg-tint-02 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs
          [&_h1]:mt-6 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold
          [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold
          [&_h3]:mt-5 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold
          [&_li]:my-1
          [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5
          [&_p]:my-3 first:[&_p]:mt-0 last:[&_p]:mb-0
          [&_pre_code]:bg-transparent [&_pre_code]:p-0
          [&_table]:my-3 [&_table]:w-full [&_table]:text-left
          [&_td]:border-t [&_td]:py-1.5 [&_th]:py-1.5 [&_th]:font-semibold
          [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5
          [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-ink-03
        "
        components={components}
        plugins={plugins}
        remarkPlugins={remarkPlugins}
        controls={controls}
        allowedTags={allowedTags}
        isAnimating={streaming}
      >
        {text}
      </Streamdown>

      {cited.length > 0 && !streaming ? (
        /* Open by default: sources behind a closed disclosure are invisible,
           and the basis of an answer should be legible without hunting for
           markers in the prose. */
        <div className="text-ink-03 mt-4 border-t pt-3 text-xs">
          <Sources defaultOpen>
            <SourcesTrigger count={cited.length} />
            <SourcesContent>
              {cited.map((source) => (
                <SourceButton
                  key={source.index}
                  title={source.title}
                  onClick={() => onSelectSource(source)}
                  aria-label={`Show the passage cited from ${source.title}`}
                  variant={activeIndex === source.index ? "active" : "default"}
                >
                  <span className="bg-tint-02 text-ink-03 inline-flex size-4 shrink-0 items-center justify-center rounded font-mono leading-none">
                    {source.index}
                  </span>
                  <span className="truncate">{source.title}</span>
                </SourceButton>
              ))}
            </SourcesContent>
          </Sources>
        </div>
      ) : null}
    </CitationContext.Provider>
  );
}

type Citations = {
  sources: MessageSource[];
  activeIndex: number | null;
  onSelectSource: (source: MessageSource) => void;
};

/**
 * How a chip learns which source it is and whether it is the open one.
 *
 * Through context rather than through `components`, because Streamdown
 * memoises each block of markdown on its text: a new `components` object does
 * not re-render a block whose text is unchanged, so a chip handed its state
 * that way never lit up when selected. Context reaches it regardless.
 */
const CitationContext = createContext<Citations>({
  sources: [],
  activeIndex: null,
  onSelectSource: () => undefined,
});

// At module scope, so Streamdown sees the same object on every render.
const components: Components = {
  // `node` and `ref` are react-markdown's own plumbing; neither belongs on the
  // element, and `ref` is typed loosely enough to reject `<sup>`.
  sup: ({ node: _node, ref: _ref, ...props }) => {
    const raw = (props as Record<string, unknown>)[CITATION_ATTRIBUTE];
    // A genuine `<sup>` from the document, not a marker we inserted.
    if (typeof raw !== "string") return <sup {...props} />;
    return <Citation index={Number.parseInt(raw, 10)}>{props.children}</Citation>;
  },
};

function Citation({ index, children }: { index: number; children: React.ReactNode }) {
  const { sources, activeIndex, onSelectSource } = useContext(CitationContext);
  const source = sources.find((candidate) => candidate.index === index);

  // The model can cite a number it was never given. Showing it as plain text
  // is honest; a dead button is not.
  if (!source) return <span className="text-ink-02">{children}</span>;

  return <CitationChip source={source} active={activeIndex === index} onSelect={onSelectSource} />;
}

function CitationChip({
  source,
  active,
  onSelect,
}: {
  source: MessageSource;
  active: boolean;
  onSelect: (source: MessageSource) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(source)}
      title={source.title}
      aria-label={`Show the passage cited from ${source.title}`}
      className={cn(
        "ml-0.5 inline-flex size-4 items-center justify-center rounded align-middle font-mono text-xs leading-none transition-colors motion-reduce:transition-none",
        active
          ? "bg-info text-white"
          : "bg-tint-02 text-ink-03 hover:bg-tint-03 hover:text-ink-04",
      )}
    >
      {source.index}
    </button>
  );
}
