import { CheckIcon, DownloadIcon } from "@onirix/ui/lib/icons";

import { ProviderLogo } from "@/components/provider-logo";

import { Frame } from "./section";

/**
 * The model setup dialog as the desktop app draws it, as static markup.
 *
 * Three rows, one in each state a model can be in: on disk and enabled,
 * downloading, and a click away. Sizes are the ones the catalog quotes.
 */
export function ModelSetupDemo() {
  return (
    <Frame
      title="Set up Ollama"
      aside={<ProviderLogo id="ollama" label="Ollama" className="size-5 rounded-md" />}
    >
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="bg-tint-02 grid grid-cols-3 gap-1 rounded-xl p-1 text-center text-sm font-medium">
          <span className="bg-card text-ink-05 rounded-lg px-2 py-2 shadow-sm">This computer</span>
          <span className="text-ink-03 px-2 py-2">Remote server</span>
          <span className="text-ink-03 px-2 py-2">Ollama Cloud</span>
        </div>

        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="bg-success size-2 rounded-full" aria-hidden />
            Ollama is running on this computer
          </p>
          <p className="text-ink-03 text-xs">Onirix reaches it at host.docker.internal:11434</p>
        </div>

        <ul className="flex flex-col gap-1 text-sm">
          <li className="bg-info-subtle text-info flex items-center gap-2.5 rounded-lg px-3 py-2.5 font-medium">
            <span className="bg-info text-primary-foreground flex size-4 items-center justify-center rounded">
              <CheckIcon className="size-3" strokeWidth={3} aria-hidden />
            </span>
            Qwen 2.5
            <span className="text-ink-03 ml-auto font-mono text-xs font-normal">4.7 GB</span>
          </li>
          <li className="flex flex-col gap-2 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              Gemma 3
              <span className="text-ink-03 ml-auto font-mono text-xs">2.1 GB of 3.3 GB</span>
            </div>
            <div className="bg-tint-02 h-1 overflow-hidden rounded-full">
              <div className="bg-primary h-full w-2/3 rounded-full" />
            </div>
          </li>
          <li className="flex items-center gap-2.5 rounded-lg px-3 py-2.5">
            gpt-oss 20B
            <span className="text-ink-03 font-mono text-xs">about 14 GB</span>
            <span className="text-ink-04 ml-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium">
              <DownloadIcon className="size-3.5" aria-hidden />
              Download
            </span>
          </li>
        </ul>
      </div>
    </Frame>
  );
}
