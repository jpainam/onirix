"use client";

import { useMutation } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { ChevronDownIcon, RepeatIcon, Trash2Icon } from "lucide-react";
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
import { ProviderLogo } from "@/components/provider-logo";
import { trpc } from "@/utils/trpc";

export type Provider = inferRouterOutputs<AppRouter>["onboarding"]["providers"][number];

/** What the workspace has already stored for a provider it is editing. */
export type ConnectedProvider = {
  models: string[];
  autoUpdateModels: boolean;
  /** Whether a key is on file. The key itself never leaves the server. */
  hasApiKey: boolean;
  baseUrl: string | null;
};

/** Models beyond this many are folded behind "More models". */
const VISIBLE_MODELS = 3;

/**
 * Connects a provider, or edits a connection that is already there.
 *
 * One dialog for both: during setup it is the workspace's first provider and
 * settles the embedding model too, and on the Language Models page it is the
 * nth, where the embedding half is already pinned to an index and the key on
 * file is kept unless the admin types a new one.
 */
export function ProviderDialog({
  provider,
  connected = null,
  settlesEmbedding = false,
  embeddingProviders,
  onOpenChange,
  onConnected,
  onDisconnect,
}: {
  provider: Provider;
  /** Present when editing rather than connecting for the first time. */
  connected?: ConnectedProvider | null;
  /** True when this is the connection that decides the embedding model. */
  settlesEmbedding?: boolean;
  /** Providers that can serve embeddings, for the fallback picker. */
  embeddingProviders: Provider[];
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
  /** Offered while editing, so removing a provider lives with its settings. */
  onDisconnect?: () => void;
}) {
  // A provider offered in both shapes starts on the self-hosted one: someone
  // running Ollama locally is the reason it is in the list at all. An existing
  // connection starts on whichever shape it was saved with.
  const [mode, setMode] = useState<"self-hosted" | "cloud">(() => {
    if (connected && provider.cloud) {
      return connected.baseUrl === provider.cloud.baseUrl ? "cloud" : "self-hosted";
    }
    return provider.selfHosted ? "self-hosted" : "cloud";
  });
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(
    connected?.baseUrl ?? provider.defaultBaseUrl ?? "",
  );
  // A hosted API serves its whole catalog to any key, so everything starts
  // enabled. A self-hosted box serves only what has been pulled, so it starts
  // with the models in view and leaves the rest to be ticked deliberately.
  const [selected, setSelected] = useState<string[]>(
    connected?.models ??
      (provider.selfHosted
        ? provider.chatModels.slice(0, VISIBLE_MODELS)
        : provider.chatModels
      ).map((model) => model.id),
  );
  const [autoUpdate, setAutoUpdate] = useState(connected?.autoUpdateModels ?? true);
  const [showAll, setShowAll] = useState(
    (connected?.models.length ?? 0) > VISIBLE_MODELS,
  );

  // Indexing needs an embedding model. The server infers one when the provider
  // being connected serves embeddings itself; otherwise this section asks, and
  // asks for that provider's key too, since Onirix keeps none of its own.
  const needsEmbeddingChoice = settlesEmbedding && !provider.servesEmbeddings;
  const [embeddingProvider, setEmbeddingProvider] = useState<Provider["id"] | "">(
    embeddingProviders[0]?.id ?? "",
  );
  const [embeddingModel, setEmbeddingModel] = useState(
    embeddingProviders[0]?.embeddingModels[0]?.id ?? "",
  );
  const [embeddingApiKey, setEmbeddingApiKey] = useState("");

  const embeddingSpec = embeddingProviders.find(
    (candidate) => candidate.id === embeddingProvider,
  );
  const embeddingKeyNeeded = Boolean(
    needsEmbeddingChoice && embeddingSpec?.requiresApiKey,
  );

  const connect = useMutation(
    trpc.models.connect.mutationOptions({
      onSuccess: onConnected,
      onError: (error) => toast.error(error.message),
    }),
  );

  const selfHosted = provider.selfHosted && mode === "self-hosted";
  const keyNeeded = !selfHosted && provider.requiresApiKey && !connected?.hasApiKey;
  const canConnect =
    selected.length > 0 &&
    (!keyNeeded || apiKey.trim().length > 0) &&
    (!selfHosted || baseUrl.trim().length > 0) &&
    (!needsEmbeddingChoice || Boolean(embeddingProvider && embeddingModel)) &&
    (!embeddingKeyNeeded || embeddingApiKey.trim().length > 0);

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
      // Blank means "keep the key on file", or fall back to the deployment's
      // own key when there is nothing on file.
      apiKey: apiKey.trim() || null,
      baseUrl: selfHosted ? baseUrl.trim() : (provider.cloud?.baseUrl ?? null),
      autoUpdateModels: autoUpdate,
      embedding: needsEmbeddingChoice
        ? {
            provider: embeddingProvider as Provider["id"],
            model: embeddingModel,
            apiKey: embeddingApiKey.trim() || null,
          }
        : null,
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent variant="sectioned" className="sm:max-w-xl">
        <div className="p-5 pb-4">
        <DialogHeader>
          <div className="text-ink-03 flex items-center gap-2">
            <ProviderLogo id={provider.id} label={provider.label} />
            <RepeatIcon className="size-4" />
            <OnirixMark className="text-ink-04 size-6" />
          </div>
          <DialogTitle>
            {connected ? `${provider.label} settings` : `Set up ${provider.label}`}
          </DialogTitle>
          <DialogDescription>
            {connected
              ? `Change the credentials and the models your workspace can use on ${provider.label}.`
              : `Connect to ${provider.label} and set up the models your workspace can use.`}
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
                placeholder={connected?.hasApiKey ? "••••••••  (leave blank to keep)" : ""}
              />
              <p className="text-ink-03 text-xs leading-4">
                {connected?.hasApiKey
                  ? "A key is already stored for this provider. Leave this blank to keep it, or paste a new one to replace it."
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
                {selfHosted
                  ? "Select the models you have pulled on this instance."
                  : "Select models to make available for this provider."}
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
                      setEmbeddingApiKey("");
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

                {/* A second provider means a second credential: Onirix has no
                    key of its own to index with. */}
                {embeddingKeyNeeded ? (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <Label htmlFor="embeddingApiKey">
                      {embeddingSpec?.label} API Key
                    </Label>
                    <Input
                      id="embeddingApiKey"
                      type="password"
                      value={embeddingApiKey}
                      onChange={(event) => setEmbeddingApiKey(event.target.value)}
                    />
                    <p className="text-ink-03 text-xs leading-4">
                      Used only to embed your documents, never to answer.
                    </p>
                  </div>
                ) : null}
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
          {/* Removing a provider belongs with its settings, not on the list
              behind a second menu. */}
          {connected && onDisconnect ? (
            <Button variant="ghost" className="mr-auto" onClick={onDisconnect}>
              <Trash2Icon className="text-destructive" />
              Disconnect
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canConnect || connect.isPending} onClick={submit}>
            {connect.isPending ? <Spinner /> : null}
            {connected ? "Save changes" : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
