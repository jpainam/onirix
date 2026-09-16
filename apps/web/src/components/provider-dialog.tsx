"use client";

import { useMutation } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { ChevronDownIcon, RepeatIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { AppRouter } from "@onirix/api/routers/index";
import { Button } from "@onirix/ui/components/button";
import { Checkbox } from "@onirix/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@onirix/ui/components/dialog";
import { Input } from "@onirix/ui/components/input";
import { Label } from "@onirix/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@onirix/ui/components/select";
import { Separator } from "@onirix/ui/components/separator";
import { Spinner } from "@onirix/ui/components/spinner";
import { Switch } from "@onirix/ui/components/switch";
import { cn } from "@onirix/ui/lib/utils";

import { OnirixMark } from "@/components/onirix-mark";
import { trpc } from "@/utils/trpc";

export type Provider = inferRouterOutputs<AppRouter>["onboarding"]["providers"][number];

/** Models beyond this many are folded behind "More models". */
const VISIBLE_MODELS = 3;

export function ProviderDialog({
  provider,
  embeddingProviders,
  embeddingFallbackAvailable,
  onOpenChange,
  onConnected,
}: {
  provider: Provider;
  /** Providers that can serve embeddings, for the fallback picker. */
  embeddingProviders: Provider[];
  /** True when the deployment's own keys already cover indexing. */
  embeddingFallbackAvailable: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}) {
  // A provider offered in both shapes starts on the self-hosted one: someone
  // running Ollama locally is the reason it is in the list at all.
  const [mode, setMode] = useState<"self-hosted" | "cloud">(
    provider.selfHosted ? "self-hosted" : "cloud",
  );
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(provider.defaultBaseUrl ?? "");
  const [selected, setSelected] = useState<string[]>(
    provider.chatModels.map((model) => model.id),
  );
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [showAll, setShowAll] = useState(false);

  // Indexing needs an embedding model. The server infers one when it can, so
  // this section only appears when there is genuinely nothing to infer from.
  const needsEmbeddingChoice =
    !provider.servesEmbeddings && !embeddingFallbackAvailable;
  const [embeddingProvider, setEmbeddingProvider] = useState<Provider["id"] | "">(
    embeddingProviders[0]?.id ?? "",
  );
  const [embeddingModel, setEmbeddingModel] = useState(
    embeddingProviders[0]?.embeddingModels[0]?.id ?? "",
  );

  const connect = useMutation(
    trpc.onboarding.connect.mutationOptions({
      onSuccess: onConnected,
      onError: (error) => toast.error(error.message),
    }),
  );

  const selfHosted = provider.selfHosted && mode === "self-hosted";
  const keyNeeded = !selfHosted && provider.requiresApiKey && !provider.hasServerKey;
  const canConnect =
    selected.length > 0 &&
    (!keyNeeded || apiKey.trim().length > 0) &&
    (!selfHosted || baseUrl.trim().length > 0) &&
    (!needsEmbeddingChoice || Boolean(embeddingProvider && embeddingModel));

  const visible = showAll
    ? provider.chatModels
    : provider.chatModels.slice(0, VISIBLE_MODELS);
  const hidden = provider.chatModels.length - visible.length;

  function toggle(modelId: string) {
    setSelected((current) =>
      current.includes(modelId)
        ? current.filter((id) => id !== modelId)
        : // Keep catalog order so the default model is stable.
          provider.chatModels
            .map((model) => model.id)
            .filter((id) => id === modelId || current.includes(id)),
    );
  }

  function submit() {
    connect.mutate({
      provider: provider.id,
      models: selected,
      apiKey: keyNeeded || (selfHosted === false && apiKey) ? apiKey.trim() || null : null,
      baseUrl: selfHosted ? baseUrl.trim() : (provider.cloud?.baseUrl ?? null),
      autoUpdateModels: autoUpdate,
      embedding: needsEmbeddingChoice
        ? { provider: embeddingProvider as Provider["id"], model: embeddingModel }
        : null,
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent variant="sectioned" className="sm:max-w-xl">
        <div className="p-5 pb-4">
        <DialogHeader>
          <div className="text-ink-03 flex items-center gap-2">
            <span className="bg-tint-02 text-ink-04 flex size-7 items-center justify-center rounded-lg text-xs font-semibold">
              {provider.label.slice(0, 1).toUpperCase()}
            </span>
            <RepeatIcon className="size-4" />
            <OnirixMark className="text-ink-04 size-6" />
          </div>
          <DialogTitle>Set up {provider.label}</DialogTitle>
          <DialogDescription>
            Connect to {provider.label} and set up the models your workspace can use.
          </DialogDescription>
        </DialogHeader>
        </div>

        <div className="bg-tint-01 flex flex-col gap-4 border-y px-5 py-4">
          {/* Two ways to reach the same models: your box, or theirs. */}
          {provider.cloud ? (
            <div className="bg-tint-02 grid grid-cols-2 gap-1 rounded-xl p-1">
              {(
                [
                  ["self-hosted", provider.selfHostedLabel ?? "Self-hosted"],
                  ["cloud", provider.cloud.label],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  aria-pressed={mode === value}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    mode === value
                      ? "bg-card text-ink-05 ring-ring/40 shadow-sm ring-1"
                      : "text-ink-03 hover:text-ink-04",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          {selfHosted ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="baseUrl">API Base URL</Label>
              <Input
                id="baseUrl"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="http://host.docker.internal:11434/v1"
              />
              <p className="text-ink-03 text-xs leading-4">
                The base URL for your {provider.label} instance. With Onirix running in
                a container, use{" "}
                <code className="bg-tint-02 rounded px-1 py-0.5 font-mono">
                  host.docker.internal
                </code>{" "}
                in place of{" "}
                <code className="bg-tint-02 rounded px-1 py-0.5 font-mono">
                  localhost
                </code>{" "}
                to reach a service on your host.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={provider.hasServerKey ? "Using the deployment's key" : ""}
              />
              <p className="text-ink-03 text-xs leading-4">
                {provider.hasServerKey
                  ? "This deployment already holds a key for this provider. Leave this blank to use it."
                  : `Paste your API key from ${provider.label} to access your models.`}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col">
              <h3 className="text-sm font-semibold">Models</h3>
              <p className="text-ink-03 text-xs leading-4">
                Select models to make available for this provider.
              </p>
            </div>
            <Button
              variant="link"
              size="sm"
              disabled={selected.length === provider.chatModels.length}
              onClick={() => setSelected(provider.chatModels.map((model) => model.id))}
            >
              Select all
            </Button>
          </div>

          <div className="flex flex-col gap-1">
            {visible.map((model) => {
              const checked = selected.includes(model.id);
              return (
                <label
                  key={model.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                    checked ? "bg-info-subtle text-info font-medium" : "hover:bg-tint-01",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(model.id)}
                    aria-label={model.label}
                  />
                  {model.label}
                </label>
              );
            })}
          </div>

          {hidden > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setShowAll(true)}
            >
              <ChevronDownIcon />
              More models ({hidden})
            </Button>
          ) : null}

          {needsEmbeddingChoice ? (
            <>
              <Separator />
              <div className="flex flex-col gap-1.5">
                <h3 className="text-sm font-semibold">Embedding model</h3>
                <p className="text-ink-03 text-xs leading-4">
                  {provider.label} serves no embedding model, so pick one to turn your
                  documents into searchable knowledge.
                </p>
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                  <Select
                    value={embeddingProvider}
                    onValueChange={(value) => {
                      const next = String(value) as Provider["id"];
                      setEmbeddingProvider(next);
                      setEmbeddingModel(
                        embeddingProviders.find((candidate) => candidate.id === next)
                          ?.embeddingModels[0]?.id ?? "",
                      );
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {embeddingProviders.map((candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          {candidate.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={embeddingModel}
                    onValueChange={(value) => setEmbeddingModel(String(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Model" />
                    </SelectTrigger>
                    <SelectContent>
                      {embeddingProviders
                        .find((candidate) => candidate.id === embeddingProvider)
                        ?.embeddingModels.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.label} ({model.dimension}d)
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          ) : null}

          <Separator />

          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <h3 className="text-sm font-semibold">Auto update</h3>
              <p className="text-ink-03 text-xs leading-4">
                Enable new {provider.label} models as Onirix adds support for them.
              </p>
            </div>
            <Switch
              checked={autoUpdate}
              onCheckedChange={setAutoUpdate}
              aria-label="Auto update models"
            />
          </div>
        </div>

        <DialogFooter variant="flush">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canConnect || connect.isPending} onClick={submit}>
            {connect.isPending ? <Spinner /> : null}
            Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
