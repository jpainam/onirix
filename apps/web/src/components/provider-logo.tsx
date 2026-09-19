import Image from "next/image";

import { cn } from "@onirix/ui/lib/utils";

/**
 * Brand marks for the providers we ship logos for.
 *
 * `invertInDark` is for the single-colour marks drawn in black: they vanish
 * against a dark surface, so the tile flips them to white. The marks that
 * carry their own colour (Anthropic's orange, Google's four) are left alone.
 */
const LOGOS: Record<string, { src: string; invertInDark: boolean }> = {
  openai: { src: "/images/openai.svg", invertInDark: true },
  anthropic: { src: "/images/claude.svg", invertInDark: false },
  google: { src: "/images/google.svg", invertInDark: false },
  ollama: { src: "/images/ollama.svg", invertInDark: true },
  xai: { src: "/images/x-ai.svg", invertInDark: true },
};

/**
 * The tile standing in for a provider, with its logo when we have one.
 *
 * Every provider in the catalog has a mark today, but a new one lands here
 * before its logo does, so it falls back to the lettered tile and the row
 * still lines up.
 */
export function ProviderLogo({
  id,
  label,
  className,
}: {
  id: string;
  label: string;
  className?: string;
}) {
  const logo = LOGOS[id];

  return (
    <span
      className={cn(
        "bg-tint-02 text-ink-04 flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold",
        className,
      )}
    >
      {logo ? (
        <Image
          src={logo.src}
          alt=""
          aria-hidden
          width={16}
          height={16}
          // The image optimizer refuses SVG unless dangerouslyAllowSVG is on,
          // and there is nothing to optimize in a 2KB vector anyway.
          unoptimized
          // Marks are not all square — Ollama's is tall — so contain rather
          // than stretch them into the box.
          className={cn("size-4 object-contain", logo.invertInDark && "dark:invert")}
        />
      ) : (
        label.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
