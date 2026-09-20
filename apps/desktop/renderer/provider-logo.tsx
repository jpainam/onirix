import { cn } from "@onirix/ui/lib/utils";

import type { ApiProviderId } from "../src/local-bridge";

/**
 * Brand marks for the providers a key can be pasted for. The files are the
 * dashboard's, copied beside the page by `scripts/bundle.mjs`.
 *
 * `invertInDark` is for the single-colour marks drawn in black, which vanish
 * against a dark surface. The ones that carry their own colour are left alone.
 */
const LOGOS: Record<ApiProviderId, { src: string; invertInDark: boolean }> = {
  openai: { src: "./images/openai.svg", invertInDark: true },
  anthropic: { src: "./images/claude.svg", invertInDark: false },
  google: { src: "./images/google.svg", invertInDark: false },
  xai: { src: "./images/x-ai.svg", invertInDark: true },
};

export function ProviderLogo({ id, className }: { id: ApiProviderId; className?: string }) {
  const logo = LOGOS[id];
  return (
    <img
      src={logo.src}
      alt=""
      aria-hidden
      draggable={false}
      // Marks are not all square, so contain rather than stretch them.
      className={cn("size-4 shrink-0 object-contain", logo.invertInDark && "dark:invert", className)}
    />
  );
}
