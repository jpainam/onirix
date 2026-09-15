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
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <Streamdown>{text}</Streamdown>
    </div>
  );
}
