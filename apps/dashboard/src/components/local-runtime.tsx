"use client";

import { CheckIcon, DownloadIcon, XIcon } from "@onirix/ui/lib/icons";

import { Button } from "@onirix/ui/components/button";
import { Checkbox } from "@onirix/ui/components/checkbox";
import { Progress } from "@onirix/ui/components/progress";
import { Spinner } from "@onirix/ui/components/spinner";
import { Switch } from "@onirix/ui/components/switch";
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
                ? "Onirix could not reach it. If Onirix runs in Docker on Linux, turn on Share on the network below."
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
 * The two switches that turn a laptop's runtime into a team's.
 *
 * Off, Ollama answers this computer only and stops with the app. On, other
 * machines can use it, and the address they need is printed right here,
 * because the person flipping the switch is about to go and type it somewhere.
 * Ollama has no login of its own, and the copy says so rather than implying a
 * protection that is not there.
 */
export function LocalSharingControls({ runtime }: { runtime: Runtime }) {
  const { sharing, busy } = runtime;
  if (!sharing || runtime.reach.state === "remote") return null;

  if (!sharing.controllable) {
    return (
      <p className="text-ink-03 text-xs leading-4">
        Ollama was started outside Onirix, so Onirix cannot change how it is shared. To
        serve other computers, set OLLAMA_HOST=0.0.0.0 where Ollama is started.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold">Share on the network</h3>
          <p className="text-ink-03 text-xs leading-4">
            Other computers can use these models. Ollama has no sign-in, so anyone on
            your network can too.
          </p>
        </div>
        <Switch
          checked={sharing.shareOnNetwork}
          disabled={busy !== null}
          onCheckedChange={(checked) => void runtime.setSharing({ shareOnNetwork: checked })}
          aria-label="Share on the network"
        />
      </div>

      {sharing.shareOnNetwork ? (
        <div className="bg-tint-02 flex flex-col gap-1 rounded-lg px-3 py-2">
          <p className="text-ink-03 text-xs leading-4">
            {busy === "sharing"
              ? "Restarting Ollama"
              : sharing.addresses.length > 0
                ? "On another computer, choose Remote server and enter:"
                : "This computer has no network address yet."}
          </p>
          {busy === "sharing"
            ? null
            : sharing.addresses.map((address) => (
                <code key={address} className="text-ink-05 font-mono text-xs select-all">
                  {address}
                </code>
              ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold">Keep serving in the background</h3>
          <p className="text-ink-03 text-xs leading-4">
            Models stay up after this app closes, and come back when you log in.
          </p>
        </div>
        <Switch
          checked={sharing.keepRunning}
          disabled={busy !== null}
          onCheckedChange={(checked) => void runtime.setSharing({ keepRunning: checked })}
          aria-label="Keep serving in the background"
        />
      </div>
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
