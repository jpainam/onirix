// Adapted from Synara (MIT), Copyright (c) 2026 T3 Tools Inc. and Emanuele Di Pietro.
import { cn } from "@onirix/ui/lib/utils";

import { ProviderLogo } from "@/components/provider-logo";

/* The five providers the model settings offer, each tile set a few degrees
   off level so the row reads as marks laid on a desk and not a logo bar. */
const MARKS = [
  { id: "anthropic", label: "Anthropic", tilt: "-rotate-6" },
  { id: "openai", label: "OpenAI", tilt: "rotate-3" },
  { id: "google", label: "Google", tilt: "-rotate-3" },
  { id: "xai", label: "xAI", tilt: "rotate-6" },
  { id: "ollama", label: "Ollama", tilt: "-rotate-2" },
] as const;

export function ProviderMarkRow({ centered = false }: { centered?: boolean }) {
  return (
    <ul
      aria-label="Supported model providers"
      className={cn("flex flex-wrap items-center gap-2", centered && "justify-center")}
    >
      {MARKS.map((mark) => (
        <li key={mark.id} title={mark.label}>
          <ProviderLogo
            id={mark.id}
            label={mark.label}
            className={cn("bg-tint-01 size-10 rounded-xl border", mark.tilt)}
          />
          <span className="sr-only">{mark.label}</span>
        </li>
      ))}
    </ul>
  );
}
