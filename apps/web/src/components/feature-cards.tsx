import type { ReactNode } from "react";

import { cn } from "@onirix/ui/lib/utils";

import { ProviderLogo } from "@/components/provider-logo";

import { Cite } from "./section";

/**
 * The three feature cards: a question someone would ask, and the piece of
 * the product that answers it, running off the card's corner the way a
 * window runs off a desk.
 *
 * The mocks are static markup drawn from the same tokens as the product, so
 * the page stays a server component. Each card is one flat colour.
 */
export function FeatureCards() {
  return (
    <div className="grid gap-x-6 gap-y-12 md:grid-cols-3">
      <FeatureCard
        tone="bg-wash-sand"
        question="What is our remote-work policy abroad?"
        title="Cited answers"
        body="Every claim links to the passage behind it, opened beside the answer."
      >
        <div className="flex flex-col gap-3 p-4 text-sm leading-6">
          <p>
            Up to 30 days per calendar year without approval
            <Cite n={1} />. Longer stays need sign-off from People Operations
            <Cite n={2} />.
          </p>
          <p className="border-warning text-ink-03 border-l-2 pl-3">
            The 2024 handbook still says 60 days
            <Cite n={3} />.
          </p>
          <ul className="text-ink-03 flex flex-col divide-y border-t text-xs">
            <li className="flex items-center gap-2 py-2">
              <Cite n={1} />
              <span className="truncate">Remote Work Policy 2026.pdf · Page 4</span>
            </li>
            <li className="flex items-center gap-2 py-2">
              <Cite n={2} />
              <span className="truncate">Global Mobility Exceptions.docx</span>
            </li>
          </ul>
        </div>
      </FeatureCard>

      <FeatureCard
        tone="bg-info-subtle"
        question="Show attainment by account executive."
        title="Charts from your files"
        body="Numbers in spreadsheets become charts. Each series cites its sheet."
      >
        <div className="flex flex-col gap-3 p-4">
          <div className="relative h-36">
            <div
              className="border-warning absolute inset-x-0 bottom-5/6 border-t border-dashed"
              aria-hidden
            />
            <ol className="absolute inset-0 flex items-end gap-3 border-b px-1">
              {BARS.map((bar) => (
                <li key={bar.name} className="flex h-full flex-1 flex-col justify-end">
                  <span className={cn("w-full rounded-t-md", bar.bar)} />
                </li>
              ))}
            </ol>
          </div>
          <ol className="text-ink-03 flex gap-3 px-1 text-xs">
            {BARS.map((bar) => (
              <li key={bar.name} className="flex-1 truncate text-center">
                {bar.name}
              </li>
            ))}
          </ol>
          <p className="text-ink-03 flex items-center gap-1 text-xs">
            <span className="bg-chart-1 size-2.5 rounded-sm" aria-hidden />
            Attainment
            <Cite n={1} />
            <span className="truncate">Q2 pipeline.xlsx</span>
          </p>
        </div>
      </FeatureCard>

      <FeatureCard
        tone="bg-success-subtle"
        question="Which model reads our documents?"
        title="Your model"
        body="Use your own provider keys, or run Ollama and send nothing outside."
      >
        <ul className="flex flex-col divide-y text-sm">
          {MODELS.map((model) => (
            <li key={model.id} className="flex items-center gap-3 px-4 py-3">
              <ProviderLogo id={model.id} label={model.label} />
              <span className="font-medium">{model.label}</span>
              <span className="text-ink-03 ml-auto font-mono text-xs">{model.note}</span>
            </li>
          ))}
        </ul>
      </FeatureCard>
    </div>
  );
}

const BARS = [
  { name: "Okafor", bar: "h-11/12 bg-chart-1" },
  { name: "Lindqvist", bar: "h-5/6 bg-chart-1/45" },
  { name: "Moreau", bar: "h-3/4 bg-chart-1/45" },
  { name: "Tanaka", bar: "h-2/3 bg-chart-1/45" },
  { name: "Reyes", bar: "h-1/2 bg-chart-1/45" },
] as const;

const MODELS = [
  { id: "anthropic", label: "Anthropic", note: "default" },
  { id: "openai", label: "OpenAI", note: "enabled" },
  { id: "ollama", label: "Ollama", note: "local" },
  { id: "google", label: "Google", note: "enabled" },
] as const;

function FeatureCard({
  tone,
  question,
  title,
  body,
  children,
}: {
  tone: string;
  question: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <figure className="flex flex-col gap-6">
      <div className={cn("relative h-96 overflow-hidden rounded-2xl", tone)}>
        <p className="bg-card absolute top-8 left-8 z-10 max-w-3/4 rounded-2xl px-5 py-4 text-lg leading-7 font-medium shadow-md">
          {question}
        </p>
        <div
          className="bg-card absolute top-36 right-0 bottom-0 left-16 overflow-hidden rounded-tl-2xl border-t border-l shadow-xl"
          aria-hidden
        >
          {children}
        </div>
      </div>
      <figcaption className="text-ink-03 px-1 text-lg leading-7 text-pretty">
        <span className="text-foreground font-semibold">{title}</span> {body}
      </figcaption>
    </figure>
  );
}
