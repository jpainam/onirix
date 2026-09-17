"use client";

import { CheckIcon, DownloadIcon, XIcon } from "lucide-react";

import { Button } from "@onirix/ui/components/button";
import { Checkbox } from "@onirix/ui/components/checkbox";
import { Progress } from "@onirix/ui/components/progress";
import { Spinner } from "@onirix/ui/components/spinner";
import { cn } from "@onirix/ui/lib/utils";

import type { useLocalRuntime } from "@/hooks/use-local-runtime";
import type { LocalProgress } from "@/lib/desktop";
import { formatBytes } from "@/lib/format";

type Runtime = ReturnType<typeof useLocalRuntime>;

function percent(progress: LocalProgress): number | null {
  if (!progress.totalBytes) return null;
  return Math.min(100, Math.round((progress.completedBytes / progress.totalBytes) * 100));
}

/** Bytes moved so far, or the runtime's own status line before a total is known. */
export function LocalDownload({ progress }: { progress: LocalProgress }) {
  const value = percent(progress);
  return (
    <Progress value={value}>
      <span className="text-ink-03 font-figure">
        {value === null
          ? progress.status
          : `${formatBytes(progress.completedBytes)} of ${formatBytes(progress.totalBytes)}`}
      </span>
    </Progress>
  );
}

/**
 * The state of the model runtime on this computer, and the one button that
 * moves it forward: install it, start it, or nothing once it is serving.
 *
 * It also carries the sentence a desktop user most needs and would never
 * guess: the Onirix server makes the model calls, so a model here is only
 * usable when the server can reach this machine.
 */
export function LocalRuntimeStatus({
  runtime,
  serverHost,
  installSize,
}: {
  runtime: Runtime;
  serverHost: string;
  /** How much the runtime download is on this platform, for the install copy. */
  installSize: string;
}) {
  const { status, reach, busy, error, progress } = runtime;

  if (reach.state === "remote") {
    return (
      <p className="text-ink-03 text-sm leading-6">
        Your Onirix server runs on <span className="text-ink-05 font-medium">{serverHost}</span>,
        and it is the server that calls the model. It cannot reach one on this computer.
        Choose Remote server and enter an address it can reach.
      </p>
    );
  }

  if (!status) {
    return (
      <p className="text-ink-03 flex items-center gap-2 text-sm">
        <Spinner /> Checking this computer
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {status.state === "running" ? (
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="bg-success size-2 rounded-full" aria-hidden />
            Ollama {status.version} is running on this computer
          </p>
          <p className="text-ink-03 text-xs leading-4">
            {reach.state === "reachable"
              ? `Onirix reaches it at ${reach.baseUrl}. Models stay available while this app is open.`
              : reach.state === "unreachable"
                ? "Onirix could not reach it. If Onirix runs in Docker on Linux, start Ollama with OLLAMA_HOST=0.0.0.0 and reopen this dialog."
                : "Checking that Onirix can reach it"}
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <p className="text-ink-03 text-sm leading-5">
            {status.state === "missing"
              ? `Ollama runs the models. Onirix downloads it once, ${installSize}.`
              : "Ollama is installed but not running."}
          </p>
          <Button
            size="sm"
            disabled={busy !== null}
            onClick={status.state === "missing" ? runtime.install : runtime.start}
          >
            {busy ? <Spinner /> : null}
            {status.state === "missing" ? "Install Ollama" : "Start Ollama"}
          </Button>
        </div>
      )}

      {progress.runtime ? <LocalDownload progress={progress.runtime} /> : null}
      {error ? <p className="text-destructive text-xs leading-4">{error}</p> : null}
    </div>
  );
}

/**
 * One catalog model as it stands on this computer: on disk and selectable,
 * downloading, or a download away.
 */
export function LocalModelRow({
  model,
  runtime,
  checked,
  onToggle,
  onDownload,
}: {
  model: { id: string; label: string; downloadGb?: number };
  runtime: Runtime;
  checked: boolean;
  onToggle: () => void;
  onDownload: () => void;
}) {
  const sizeOnDisk = runtime.downloaded.get(model.id);
  const downloading = runtime.progress[model.id];
  const ready = runtime.status?.state === "running";

  if (sizeOnDisk !== undefined) {
    return (
      <label
        className={cn(
          "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
          checked ? "bg-info-subtle text-info font-medium" : "hover:bg-tint-01",
        )}
      >
        <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={model.label} />
        {model.label}
        <span className="text-ink-03 font-figure ml-auto flex items-center gap-1.5 font-normal">
          <CheckIcon className="text-success size-3.5" aria-hidden />
          {formatBytes(sizeOnDisk)}
        </span>
      </label>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg px-3 py-2 text-sm">
      <div className="flex items-center gap-2.5">
        <span className="text-ink-04">{model.label}</span>
        {model.downloadGb ? (
          <span className="text-ink-03 font-figure">about {model.downloadGb} GB</span>
        ) : null}
        {downloading ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => runtime.cancel(model.id)}
          >
            <XIcon />
            Cancel
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={!ready}
            onClick={onDownload}
          >
            <DownloadIcon />
            Download
          </Button>
        )}
      </div>
      {downloading ? <LocalDownload progress={downloading} /> : null}
    </div>
  );
}
