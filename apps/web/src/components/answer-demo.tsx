import {
  ArrowUpIcon,
  ExternalLinkIcon,
  FileTextIcon,
  PaperclipIcon,
} from "lucide-react";

import { OnirixMark } from "@onirix/ui/brand/onirix-mark";
import { ProviderLogo } from "@/components/provider-logo";

import { Cite, Frame } from "./section";

/**
 * The hero object: one answer, drawn the way the product draws it.
 *
 * It is static markup, not the real chat surface, so the page stays a server
 * component and ships no client bundle. Everything it shows is a thing the
 * product does: citation markers on company claims, the passage opened beside
 * the answer, a link to the original file, and a disagreement between two
 * documents surfaced instead of quietly resolved.
 */
export function AnswerDemo() {
  return (
    <Frame
      title="Remote work policy"
      aside={
        <span className="text-ink-03 flex items-center gap-1.5 text-xs">
          <ProviderLogo id="anthropic" label="Anthropic" className="size-5 rounded-md" />
          Claude
        </span>
      }
    >
      <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6 p-5 sm:p-7">
          <div className="flex justify-end">
            <p className="bg-tint-02 max-w-md rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-6">
              What is our international remote-work policy, and which exceptions
              need approval?
            </p>
          </div>

          <div className="flex gap-3">
            <OnirixMark className="text-ink-03 mt-1 size-5 shrink-0" />
            <div className="flex flex-col gap-3 text-sm leading-6">
              <p>
                Employees may work from another country for up to 30 days per
                calendar year without approval<Cite n={1} />. Beyond 30 days, or
                in any country where the company has no payroll entity, the
                request needs sign-off from the manager and People Operations
                <Cite n={1} />
                <Cite n={2} />.
              </p>
              <p>
                Roles that handle regulated customer data need approval for any
                stay, regardless of length<Cite n={2} />.
              </p>
              <p className="border-warning text-ink-03 border-l-2 pl-3">
                The 2024 handbook still says 60 days<Cite n={3} />. The 2026 policy
                supersedes it, so the answer above follows the newer document.
              </p>
            </div>
          </div>

          <div className="mt-auto flex items-center gap-2 rounded-xl border px-3 py-2">
            <PaperclipIcon className="text-ink-02 size-4" aria-hidden />
            <span className="text-ink-02 flex-1 text-sm">Ask a follow-up</span>
            <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-full">
              <ArrowUpIcon className="size-4" aria-hidden />
            </span>
          </div>
        </div>

        <aside className="bg-tint-01 flex flex-col gap-4 border-t p-5 lg:border-t-0 lg:border-l">
          <div className="flex items-center justify-between">
            <span className="text-ink-03 font-mono text-xs uppercase">Source 1 of 3</span>
            <span className="bg-info-subtle text-info rounded-full px-2 py-0.5 font-mono text-xs">
              cited
            </span>
          </div>

          <div className="flex items-start gap-3">
            <span className="bg-card flex size-9 shrink-0 items-center justify-center rounded-lg border">
              <FileTextIcon className="text-ink-03 size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Remote Work Policy 2026.pdf</p>
              <p className="text-ink-03 font-figure mt-0.5">PDF · Page 4 · Updated Mar 2026</p>
            </div>
          </div>

          <blockquote className="bg-card rounded-lg border p-3 text-sm leading-6">
            An employee may work from a country other than their country of
            employment for a maximum of{" "}
            <mark className="bg-info-subtle text-foreground rounded-sm px-0.5">
              thirty (30) days in any calendar year
            </mark>{" "}
            without prior approval. Longer stays require written approval from
            the employee&apos;s manager and People Operations.
          </blockquote>

          <span className="text-ink-04 flex items-center gap-1.5 text-sm font-medium">
            Open original file
            <ExternalLinkIcon className="size-3.5" aria-hidden />
          </span>

          <ul className="mt-auto flex flex-col divide-y border-t pt-1 text-sm">
            <li className="text-ink-03 flex items-center gap-2 py-2">
              <Cite n={2} />
              <span className="truncate">Global Mobility Exceptions.docx</span>
            </li>
            <li className="text-ink-03 flex items-center gap-2 py-2">
              <Cite n={3} />
              <span className="truncate">Employee Handbook 2024.pdf</span>
            </li>
          </ul>
        </aside>
      </div>
    </Frame>
  );
}
