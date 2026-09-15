"use client";

import type { UIMessage } from "ai";
import { Streamdown } from "streamdown";

/**
 * Renders an answer, turning inline `[1]` markers into citation chips.
 *
 * PRODUCT.md treats citations as central to trusting Onirix, so the marker is
 * a real affordance rather than literal text in the prose.
 */
export function AnswerWithCitations({ message }: { message: UIMessage }) {
  const text = message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");

  if (message.role === "user") {
    return <p className="whitespace-pre-wrap">{text}</p>;
  }

  return (
    /* The markdown is styled here rather than in a `prose` preset so the type
       scale matches the rest of the app instead of a typography plugin's. */
    <div
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
    >
      <Streamdown>{text}</Streamdown>
    </div>
  );
}
