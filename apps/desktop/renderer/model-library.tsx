/**
 * The Open models page: every model Onirix offers on the left, the chosen one
 * and its download on the right.
 *
 * The list is there whether or not Ollama is: looking costs nothing, so a
 * machine without the runtime still browses. What is missing is said once,
 * across the top, and the Download buttons wait disabled until it is fixed. The setup dialog keeps the compact list in
 * model-store.tsx; both read the same runtime snapshot, so a download started
 * in one shows in the other.
 */
import { CheckIcon } from "@onirix/ui/lib/icons";
import { useMemo, useState } from "react";

import { browseOpenModels } from "@onirix/llm/open-models";
import { PROVIDERS } from "@onirix/llm/catalog";
import { Badge } from "@onirix/ui/components/badge";
import { Button } from "@onirix/ui/components/button";
import { type BrowserModel, ModelBrowser } from "@onirix/ui/components/model-browser";
import { Spinner } from "@onirix/ui/components/spinner";

import type { ModelChoice } from "../src/local-bridge";

import { cancel, install, pull, remove, start, useRuntime } from "./use-runtime";

const CATALOG: BrowserModel[] = browseOpenModels();
const EMBEDDING_IDS = new Set(PROVIDERS.ollama.embeddingModels.map((model) => model.id));

export function ModelLibrary({
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

  const installed = useMemo(
    () => new Map(runtime.models.map((model) => [model.name, model.sizeBytes])),
    [runtime.models],
  );

  // Models the person already had, which the catalog has never heard of. They
  // are theirs and they work, so they are listed too. Embedding models are
  // left out: they cannot hold a conversation.
  const models = useMemo(
    () => [
      ...CATALOG,
      ...runtime.models
        .filter(
          (model) =>
            !CATALOG.some((entry) => entry.id === model.name) &&
            !EMBEDDING_IDS.has(model.name) &&
            !/embed/i.test(model.name),
        )
        .map(
          (model): BrowserModel => ({
            id: model.name,
            label: model.name,
            summary: "Already on this computer",
            inLibrary: false,
          }),
        ),
    ],
    [runtime.models],
  );

  if (!runtime.status) {
    return (
      <div className="text-ink-03 flex items-center gap-2 p-8 text-sm">
        <Spinner /> Checking this computer
      </div>
    );
  }

  function use(model: string) {
    setUseError(null);
    onUse(model).catch((failure: unknown) => {
      setUseError(failure instanceof Error ? failure.message : String(failure));
    });
  }

  const missing = runtime.status.state === "missing";
  const blocked =
    runtime.status.state === "running"
      ? null
      : {
          message: missing
            ? "Open models need Ollama, a free runtime."
            : "Ollama is not running.",
          action: (
            <Button
              className="shrink-0 rounded-full px-4"
              disabled={runtime.busy !== null}
              onClick={() => void (missing ? install() : start())}
            >
              {runtime.busy ? <Spinner /> : null}
              {missing
                ? runtime.busy
                  ? installLabel(runtime.progress.runtime)
                  : "Install Ollama"
                : runtime.busy
                  ? "Starting Ollama"
                  : "Start Ollama"}
            </Button>
          ),
        };

  return (
    <ModelBrowser
      models={models}
      destination="Downloads to this computer"
      blocked={blocked}
      error={useError ?? runtime.error}
      stateOf={(id) => ({
        installedBytes: installed.get(id) ?? null,
        progress: runtime.progress[id] ?? null,
      })}
      onDownload={(id) => void pull(id)}
      onCancel={cancel}
      onRemove={(id) => void remove(id)}
      removeBlocked={(id) => (id === inUse ? "This model is in use." : null)}
      rowBadge={(id) => (id === inUse ? <Badge variant="success">In use</Badge> : null)}
      installedActions={(model) =>
        model.id === inUse ? (
          <Badge variant="success">
            <CheckIcon /> In use
          </Badge>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full px-3"
            onClick={() => use(model.id)}
          >
            Use this model
          </Button>
        )
      }
    />
  );
}

/** Ollama itself is a download too; the button carries its progress. */
function installLabel(progress: { completedBytes: number; totalBytes: number } | undefined) {
  if (!progress || progress.totalBytes === 0) return "Installing Ollama";
  return `Installing Ollama (${Math.round((progress.completedBytes / progress.totalBytes) * 100)}%)`;
}
