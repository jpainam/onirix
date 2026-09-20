import type { ReactNode } from "react";

import { cn } from "@onirix/ui/lib/utils";

import { ProviderLogo } from "@/components/provider-logo";

import { Cite } from "./section";

/**
 * The three pieces of the product the showcase rows point at: a cited answer,
 * a chart drawn from a spreadsheet, and the provider list.
 *
 * They are static markup drawn from the same tokens as the product, so the
 * page stays a server component. They illustrate; the screenshots in the
 * tour are the real thing.
 */
function Mock({ question, children }: { question: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <p className="bg-primary text-primary-foreground max-w-5/6 self-end rounded-2xl px-4 py-2.5 text-sm leading-6">
        {question}
      </p>
      <div className="bg-card overflow-hidden rounded-xl border">{children}</div>
    </div>
  );
}

export function CitedAnswerMock() {
  return (
    <Mock question="What is our remote-work policy abroad?">
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
            <span className="truncate">Remote Work Policy 2026.pdf, page 4</span>
          </li>
          <li className="flex items-center gap-2 py-2">
            <Cite n={2} />
            <span className="truncate">Global Mobility Exceptions.docx</span>
          </li>
          <li className="flex items-center gap-2 pt-2">
            <Cite n={3} />
            <span className="truncate">Employee Handbook 2024.pdf, page 31</span>
          </li>
        </ul>
      </div>
    </Mock>
  );
}

const BARS = [
  { name: "Okafor", bar: "h-11/12 bg-chart-1" },
  { name: "Lindqvist", bar: "h-5/6 bg-chart-1/45" },
  { name: "Moreau", bar: "h-3/4 bg-chart-1/45" },
  { name: "Tanaka", bar: "h-2/3 bg-chart-1/45" },
  { name: "Reyes", bar: "h-1/2 bg-chart-1/45" },
] as const;

export function ChartMock() {
  return (
    <Mock question="Show attainment by account executive.">
      <div className="flex flex-col gap-3 p-4">
        <div className="relative h-40">
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
        <p className="text-ink-03 flex items-center gap-1 border-t pt-3 text-xs">
          <span className="bg-chart-1 size-2.5 rounded-sm" aria-hidden />
          Attainment
          <Cite n={1} />
          <span className="truncate">Q2 pipeline.xlsx, sheet Attainment</span>
        </p>
      </div>
    </Mock>
  );
}

const MODELS = [
  { id: "anthropic", label: "Anthropic", note: "default" },
  { id: "openai", label: "OpenAI", note: "enabled" },
  { id: "google", label: "Google", note: "enabled" },
  { id: "xai", label: "xAI", note: "not connected" },
  { id: "ollama", label: "Ollama", note: "local" },
] as const;

export function ModelsMock() {
  return (
    <div className="bg-card overflow-hidden rounded-xl border" aria-hidden>
      <p className="text-ink-03 border-b px-4 py-2.5 font-mono text-xs">Model providers</p>
      <ul className="flex flex-col divide-y text-sm">
        {MODELS.map((model) => (
          <li key={model.id} className="flex items-center gap-3 px-4 py-3">
            <ProviderLogo id={model.id} label={model.label} />
            <span className="font-medium">{model.label}</span>
            <span className="text-ink-03 ml-auto font-mono text-xs">{model.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
