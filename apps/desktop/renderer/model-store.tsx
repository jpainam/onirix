/**
 * The local model store: open source models, downloaded to this computer.
 *
 * Shown in the setup dialog and again in Settings. It has three faces, in the
 * order a new machine meets them: no runtime (offer to install Ollama), a
 * runtime that is not running (offer to start it), and the list of models.
 * The catalog is the server's own (`PROVIDERS.ollama`), so a model offered
 * here is one the rest of Onirix knows how to talk to.
 */
import { CheckIcon, DownloadIcon, Trash2Icon, XIcon } from "@onirix/ui/lib/icons";
import { useState } from "react";

import { PROVIDERS } from "@onirix/llm/catalog";
import { Badge } from "@onirix/ui/components/badge";
import { Button } from "@onirix/ui/components/button";
import { Spinner } from "@onirix/ui/components/spinner";
import { cn } from "@onirix/ui/lib/utils";

import type { LocalProgress, ModelChoice } from "../src/local-bridge";

import { TILE } from "./tokens";
import { cancel, install, pull, remove, start, useRuntime } from "./use-runtime";

const CATALOG = PROVIDERS.ollama.chatModels;
const EMBEDDING_IDS = new Set(PROVIDERS.ollama.embeddingModels.map((model) => model.id));

function gigabytes(bytes: number): string {
  const gb = bytes / 1e9;
  return `${gb >= 10 ? Math.round(gb) : gb.toFixed(1)} GB`;
}

function ProgressBar({ progress }: { progress: LocalProgress }) {
  const known = progress.totalBytes > 0;
  const percent = known
    ? Math.min(100, Math.round((progress.completedBytes / progress.totalBytes) * 100))
    : 0;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? percent : undefined}
        aria-label={`Downloading ${progress.target}`}
        className="bg-tint-03 h-1 w-full overflow-hidden rounded-full"
      >
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-ink-03 font-figure truncate">
        {known
          ? `${gigabytes(progress.completedBytes)} of ${gigabytes(progress.totalBytes)} (${percent}%)`
          : progress.status || "Starting"}
      </span>
    </div>
  );
}

export function ModelStore({
  choice,
  onUse,
}: {
  choice: ModelChoice | null;
  /** Rejects with a sentence when the model cannot be used. */
  onUse: (model: string) => Promise<void>;
}) {
  const runtime = useRuntime();
  const [useError, setUseError] = useState<string | null>(null);
  const inUse = choice?.kind === "local" ? choice.model : null;

  if (!runtime.status) {
    return (
      <div className="text-ink-03 flex items-center gap-2 py-6 text-sm">
        <Spinner /> Checking this computer
      </div>
    );
  }

  const problem = useError ?? runtime.error;
  const error = problem ? (
    <p className="text-destructive text-sm select-text" role="alert">
      {problem}
    </p>
  ) : null;

  function use(model: string) {
    setUseError(null);
    onUse(model).catch((failure: unknown) => {
      setUseError(failure instanceof Error ? failure.message : String(failure));
    });
  }

  if (runtime.status.state !== "running") {
    const missing = runtime.status.state === "missing";
    const downloading = runtime.progress.runtime;
    return (
      <div className="flex flex-col gap-3 text-sm">
        <div className={cn("flex flex-col gap-3 p-5", TILE)}>
          <div className="flex flex-col gap-1">
            <span className="font-medium">
              {missing ? "Local models need Ollama" : "Ollama is installed but not running"}
            </span>
            <span className="text-ink-03">
              {missing
                ? "A free runtime, installed in Onirix's own folder."
                : "Start it to see and download models."}
            </span>
          </div>
          {runtime.busy === "install" && downloading ? (
            <ProgressBar progress={downloading} />
          ) : (
            <div>
              <Button
                className="rounded-full px-4"
                disabled={runtime.busy !== null}
                onClick={() => void (missing ? install() : start())}
              >
                {runtime.busy ? <Spinner /> : null}
                {missing
                  ? runtime.busy
                    ? "Installing Ollama"
                    : "Install Ollama"
                  : runtime.busy
                    ? "Starting Ollama"
                    : "Start Ollama"}
              </Button>
            </div>
          )}
        </div>
        {error}
      </div>
    );
  }

  const installed = new Map(runtime.models.map((model) => [model.name, model]));
  // Models the person already had, which the catalog has never heard of. They
  // are theirs and they work, so they are offered too. Embedding models are
  // left out: they cannot hold a conversation.
  const others = runtime.models.filter(
    (model) =>
      !CATALOG.some((entry) => entry.id === model.name) &&
      !EMBEDDING_IDS.has(model.name) &&
      !/embed/i.test(model.name),
  );

  const rows = [
    ...CATALOG.map((entry) => ({
      id: entry.id,
      label: entry.label,
      reasons: entry.reasons === true,
      size: installed.has(entry.id)
        ? gigabytes(installed.get(entry.id)?.sizeBytes ?? 0)
        : entry.downloadGb
          ? `${entry.downloadGb} GB download`
          : "",
      present: installed.has(entry.id),
    })),
    ...others.map((model) => ({
      id: model.name,
      label: model.name,
      reasons: false,
      size: gigabytes(model.sizeBytes),
      present: true,
    })),
  ];

  return (
    <div className="flex flex-col gap-3 text-sm">
      <ul className={cn("divide-y overflow-hidden", TILE)}>
        {rows.map((row) => {
          const progress = runtime.progress[row.id];
          const active = inUse === row.id;
          return (
            <li key={row.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2 font-medium">
                  <span className="truncate">{row.label}</span>
                  {row.reasons ? <Badge variant="muted">Reasoning</Badge> : null}
                </span>
                <span className="text-ink-03 font-figure truncate">
                  {row.id}
                  {row.size ? `, ${row.size}` : ""}
                </span>
              </div>

              {progress ? (
                <div className="flex w-64 shrink-0 items-center gap-2">
                  <ProgressBar progress={progress} />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Cancel downloading ${row.label}`}
                    onClick={() => cancel(row.id)}
                  >
                    <XIcon />
                  </Button>
                </div>
              ) : row.present ? (
                <div className="flex shrink-0 items-center gap-1">
                  {active ? (
                    <Badge variant="success">
                      <CheckIcon /> In use
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full px-3"
                      onClick={() => use(row.id)}
                    >
                      Use this model
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="icon-sm"
                    aria-label={`Remove ${row.label} from this computer`}
                    disabled={active}
                    onClick={() => void remove(row.id)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 rounded-full px-3"
                  onClick={() => void pull(row.id)}
                >
                  <DownloadIcon /> Download
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {error}
    </div>
  );
}
