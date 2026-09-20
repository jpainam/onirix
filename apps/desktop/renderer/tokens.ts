/** Class names shared across the local renderer, so its surfaces agree. */

/** The quiet bordered surface used for tiles, lists, and option cards. */
export { TILE } from "@onirix/ui/components/settings-section";

/** An option card that can be chosen: the tile, plus how it shows selection. */
export const OPTION =
  "rounded-xl border bg-card text-left transition-colors motion-reduce:transition-none hover:bg-tint-01 focus-visible:ring-3 focus-visible:ring-ring/50 outline-none aria-checked:border-foreground aria-checked:bg-tint-01";
