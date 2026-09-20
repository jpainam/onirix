// Adapted from Synara (MIT), Copyright (c) 2026 T3 Tools Inc. and Emanuele Di Pietro.
"use client";

import { ChevronDownIcon } from "@onirix/ui/lib/icons";
import { useState } from "react";

import { cn } from "@onirix/ui/lib/utils";

import { Section, SectionIntro } from "@/components/section";

/* Every answer here is a statement PRODUCT.md or the security page already
   makes. When one of those changes, this list changes with it. */
const ITEMS = [
  {
    id: "training",
    question: "Does my data train a model?",
    answer:
      "Onirix does not train or fine-tune anything. It retrieves the passages that answer a question and sends them to the provider you connected, under your own API key, so that provider's API terms are the ones that apply. With Ollama, nothing is sent anywhere.",
  },
  {
    id: "models",
    question: "Which models can I use?",
    answer:
      "OpenAI, Anthropic, Google, xAI, and self-hosted Ollama. You can enable several at once, choose the default, and use one provider for chat and another for embeddings.",
  },
  {
    id: "offline",
    question: "Can it run offline?",
    answer:
      "Yes. Self-host the stack and use Ollama for both chat and embeddings, and questions are answered without an outbound request. Cloud sources such as Google Drive still need network access to sync.",
  },
  {
    id: "self-hosting",
    question: "What do I need to self-host it?",
    answer:
      "Docker. The compose file runs the application and its indexing worker beside PostgreSQL, OpenSearch, Redis, and MinIO or any other S3-compatible store.",
  },
  {
    id: "visibility",
    question: "Who can see a document I upload?",
    answer:
      "You choose: the whole organization, selected teams plus you, or only you. The rule is applied inside the search query, and administrators get no reading rights from their role. Conversations are private to their author.",
  },
  {
    id: "formats",
    question: "Which files and sources does it read?",
    answer:
      "PDF, Word, Excel, CSV, Markdown, HTML, JSON, and plain text, up to 50 MB per file. It also syncs websites, Google Drive, OneDrive, and S3 buckets. PowerPoint and images are not supported yet.",
  },
  {
    id: "desktop",
    question: "Do I need the desktop app?",
    answer:
      "No, Onirix runs in the browser. The desktop app is a client for an Onirix server, and it can download open models and run them on the same computer.",
  },
] as const;

/**
 * The FAQ as a list of rules, one question open at a time.
 *
 * A height of `auto` cannot be animated, so each panel is a one-row grid
 * whose track moves between 0fr and 1fr. The inner `min-h-0` lets the row
 * collapse, and the padding sits inside it so it collapses with the text.
 * A closed panel is `inert`, which keeps it out of the tab order and the
 * accessibility tree.
 */
export function Faq() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Section id="faq" labelledBy="faq-heading" className="bg-tint-01">
      <SectionIntro eyebrow="FAQ" title="Questions a security review asks first." titleId="faq-heading" />

      <div className="mt-10 divide-y border-y sm:mt-12">
        {ITEMS.map((item) => {
          const isOpen = open === item.id;
          const panelId = `faq-${item.id}`;
          const labelId = `faq-${item.id}-label`;
          return (
            <div key={item.id}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : item.id)}
                className="focus-visible:ring-ring/50 flex min-h-14 w-full cursor-pointer items-center justify-between gap-5 rounded-md py-4 text-left outline-none focus-visible:ring-3 sm:min-h-16"
              >
                <span id={labelId} className="text-base leading-6 font-medium">
                  {item.question}
                </span>
                <ChevronDownIcon
                  aria-hidden
                  className={cn(
                    "text-ink-03 size-5 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
              <div
                id={panelId}
                role="region"
                aria-labelledby={labelId}
                inert={!isOpen}
                className={cn(
                  "ease-house grid overflow-hidden transition-all duration-300 motion-reduce:transition-none",
                  isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                )}
              >
                <div className="min-h-0">
                  <p className="text-ink-03 max-w-2xl pb-6 text-sm leading-7 text-pretty">
                    {item.answer}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
