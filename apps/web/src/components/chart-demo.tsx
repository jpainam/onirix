import { CopyIcon, TableIcon } from "lucide-react";

import { cn } from "@onirix/ui/lib/utils";

import { Cite, Frame } from "./section";

/**
 * A chart the way the product builds one: from numbers found in an uploaded
 * spreadsheet, with a citation on the series and the table one click away.
 *
 * Bars are plain divs at fraction heights so the mock renders on the server
 * with no chart library. The target sits at five sixths of the plot, near
 * enough to the 85% it labels for a picture this size.
 */
const BARS = [
  { name: "Okafor", value: "92%", bar: "h-11/12 bg-chart-1" },
  { name: "Lindqvist", value: "83%", bar: "h-5/6 bg-chart-1/45" },
  { name: "Moreau", value: "75%", bar: "h-3/4 bg-chart-1/45" },
  { name: "Tanaka", value: "67%", bar: "h-2/3 bg-chart-1/45" },
  { name: "Reyes", value: "50%", bar: "h-1/2 bg-chart-1/45" },
] as const;

export function ChartDemo() {
  return (
    <Frame
      title="Quarterly attainment by account executive"
      aside={<span className="text-ink-03 font-mono text-xs">bar</span>}
    >
      <div className="flex flex-col gap-5 p-5 sm:p-7">
        <div className="relative h-56">
          <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
            <span className="border-border/60 border-t" />
            <span className="border-border/60 border-t" />
            <span className="border-border/60 border-t" />
            <span className="border-border/60 border-t" />
            <span className="border-t" />
          </div>

          <div className="border-warning absolute inset-x-0 bottom-5/6 border-t border-dashed" aria-hidden>
            <span className="bg-card text-warning absolute right-0 -top-2.5 px-1.5 font-mono text-xs">
              85% target
            </span>
          </div>

          <ol className="absolute inset-0 flex items-end justify-around gap-3 px-2">
            {BARS.map((bar) => (
              <li key={bar.name} className="flex h-full w-12 flex-col items-center justify-end gap-1.5">
                <span className="bg-card text-ink-03 font-figure relative z-10 rounded-sm px-1">{bar.value}</span>
                <span className={cn("w-full rounded-t-md", bar.bar)} />
              </li>
            ))}
          </ol>
        </div>

        <ol className="text-ink-03 flex justify-around px-2 text-xs">
          {BARS.map((bar) => (
            <li key={bar.name} className="w-12 truncate text-center">
              {bar.name}
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-ink-03 flex items-center gap-1 text-xs">
            <span className="bg-chart-1 size-2.5 rounded-sm" aria-hidden />
            Attainment
            <Cite n={1} />
            <span className="truncate">Q2 pipeline.xlsx · sheet &ldquo;AE summary&rdquo;</span>
          </p>
          <div className="flex items-center gap-1.5">
            <span className="text-ink-03 flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs">
              <TableIcon className="size-3.5" aria-hidden />
              Table
            </span>
            <span className="text-ink-03 flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs">
              <CopyIcon className="size-3.5" aria-hidden />
              Copy data
            </span>
          </div>
        </div>
      </div>
    </Frame>
  );
}
