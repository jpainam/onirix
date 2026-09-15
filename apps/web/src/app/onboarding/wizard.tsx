"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckIcon, ChevronLeftIcon, CpuIcon, LayersIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@onirix/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@onirix/ui/components/field";
import { Input } from "@onirix/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@onirix/ui/components/select";
import { Separator } from "@onirix/ui/components/separator";
import { Spinner } from "@onirix/ui/components/spinner";
import { cn } from "@onirix/ui/lib/utils";

import { OnirixWordmark } from "@/components/onirix-mark";
import { trpc } from "@/utils/trpc";

type Step = "organization" | "models";

/** Providers are shown as a grid of tiles; the initial stands in for a logo. */
function ProviderTile({
  label,
  vendor,
  selected,
  onSelect,
}: {
  label: string;
  vendor: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "bg-card flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
        selected ? "border-ring ring-ring/40 ring-1" : "hover:bg-tint-01"
      )}
    >
      <span className="bg-tint-02 text-ink-04 flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold">
        {label.slice(0, 1).toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{label}</span>
        <span className="text-ink-03 truncate text-xs">{vendor}</span>
      </span>
      <span className="text-ink-02 shrink-0 text-xs">
        {selected ? <CheckIcon className="text-info size-4" /> : "Connect"}
      </span>
    </button>
  );
}

export function OnboardingWizard({ userName }: { userName: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("organization");
  const [organizationName, setOrganizationName] = useState("");

  const providers = useQuery(trpc.onboarding.providers.queryOptions());

  const [chatProvider, setChatProvider] = useState<string>("");
  const [chatModel, setChatModel] = useState<string>("");
  const [chatApiKey, setChatApiKey] = useState("");
  const [chatBaseUrl, setChatBaseUrl] = useState("");

  const [embeddingProvider, setEmbeddingProvider] = useState<string>("");
  const [embeddingModel, setEmbeddingModel] = useState<string>("");
  const [embeddingApiKey, setEmbeddingApiKey] = useState("");

  const selectedChatProvider = useMemo(
    () => providers.data?.find((p) => p.id === chatProvider),
    [providers.data, chatProvider],
  );

  // Only providers that actually serve embeddings can be chosen for indexing.
  const embeddingProviders = useMemo(
    () => providers.data?.filter((p) => p.embeddingModels.length > 0) ?? [],
    [providers.data],
  );
  const selectedEmbeddingProvider = useMemo(
    () => embeddingProviders.find((p) => p.id === embeddingProvider),
    [embeddingProviders, embeddingProvider],
  );

  const setup = useMutation(
    trpc.onboarding.setup.mutationOptions({
      onSuccess: () => {
        router.push("/chat");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const chatKeyNeeded =
    (selectedChatProvider?.requiresApiKey ?? false) && !selectedChatProvider?.hasServerKey;
  const embeddingKeyNeeded =
    (selectedEmbeddingProvider?.requiresApiKey ?? false) &&
    !selectedEmbeddingProvider?.hasServerKey;

  const canSubmit =
    Boolean(chatProvider && chatModel && embeddingProvider && embeddingModel) &&
    (!chatKeyNeeded || chatApiKey.length > 0) &&
    (!embeddingKeyNeeded ||
      embeddingApiKey.length > 0 ||
      // A shared provider reuses the chat key entered above.
      (embeddingProvider === chatProvider && chatApiKey.length > 0));

  /**
   * When chat and embedding share a provider the user is only asked for the key
   * once, so the chat key stands in for both.
   */
  const effectiveEmbeddingKey =
    embeddingProvider === chatProvider && !embeddingApiKey ? chatApiKey : embeddingApiKey;

  function handleSubmit() {
    setup.mutate({
      organizationName,
      chat: {
        provider: chatProvider as "openai",
        model: chatModel,
        apiKey: chatKeyNeeded ? chatApiKey : null,
        baseUrl: chatBaseUrl || null,
      },
      embedding: {
        provider: embeddingProvider as "openai",
        model: embeddingModel,
        apiKey: embeddingKeyNeeded ? effectiveEmbeddingKey : null,
        baseUrl: null,
      },
    });
  }

  return (
    <div className="bg-background min-h-svh">
      <div className="mx-auto flex w-full max-w-2xl flex-col px-6 py-14">
        <OnirixWordmark className="mb-10" />

        <div className="bg-card shadow-lg rounded-2xl border">
          {/* The step strip is the only chrome the wizard needs — it states
              where you are without a progress bar that would overstate it. */}
          <div className="flex items-center justify-between px-6 py-3.5">
            <span className="text-ink-03 text-sm">
              {step === "organization"
                ? "Name your workspace to get started."
                : "Almost there! Connect your models to start chatting."}
            </span>
            <span className="font-figure text-ink-02 shrink-0">
              Step {step === "organization" ? 1 : 2} of 2
            </span>
          </div>
          <Separator />

          {step === "organization" ? (
            <div className="flex flex-col gap-6 p-6">
              <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-display">
                  Welcome, {userName}
                </h1>
                <p className="text-ink-03 text-sm">
                  Let&apos;s set up your private AI workspace. First, what should we call
                  your organization?
                </p>
              </div>

              <Field>
                <FieldLabel htmlFor="organizationName">Organization name</FieldLabel>
                <Input
                  id="organizationName"
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  placeholder="Acme Inc."
                  autoFocus
                />
              </Field>

              <div className="flex justify-end">
                <Button
                  size="lg"
                  disabled={organizationName.trim().length === 0}
                  onClick={() => setStep("models")}
                >
                  Continue
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-8 p-6">
              <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-display">
                  Connect your models
                </h1>
                <p className="text-ink-03 text-sm">
                  Onirix supports both self-hosted models and popular providers. Pick a
                  self-hosted one to keep every request inside your own network.
                </p>
              </div>

              {providers.isPending ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : (
                <>
                  <section className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <CpuIcon className="text-ink-03 size-4" />
                      <h2 className="text-sm font-semibold">Chat model</h2>
                      <span className="text-ink-03 text-xs">
                        Answers questions and reasons over results.
                      </span>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {providers.data?.map((provider) => (
                        <ProviderTile
                          key={provider.id}
                          label={provider.label}
                          vendor={provider.selfHosted ? "Self-hosted" : provider.description}
                          selected={chatProvider === provider.id}
                          onSelect={() => {
                            setChatProvider(provider.id);
                            setChatModel("");
                            setChatBaseUrl(provider.defaultBaseUrl ?? "");
                          }}
                        />
                      ))}
                    </div>

                    {selectedChatProvider ? (
                      <div className="flex flex-col gap-3 pt-1">
                        <Field>
                          <FieldLabel>Model</FieldLabel>
                          <Select
                            value={chatModel}
                            onValueChange={(value) => setChatModel(value ?? "")}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a model" />
                            </SelectTrigger>
                            <SelectContent>
                              {selectedChatProvider.chatModels.map((model) => (
                                <SelectItem key={model.id} value={model.id}>
                                  {model.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {selectedChatProvider.hasServerKey ? (
                            <FieldDescription>
                              An API key is already configured on this deployment.
                            </FieldDescription>
                          ) : null}
                        </Field>

                        {chatKeyNeeded ? (
                          <Field>
                            <FieldLabel htmlFor="chatApiKey">
                              {selectedChatProvider.label} API key
                            </FieldLabel>
                            <Input
                              id="chatApiKey"
                              type="password"
                              value={chatApiKey}
                              onChange={(event) => setChatApiKey(event.target.value)}
                              placeholder="sk-…"
                            />
                          </Field>
                        ) : null}

                        {selectedChatProvider.selfHosted ? (
                          <Field>
                            <FieldLabel htmlFor="chatBaseUrl">Endpoint</FieldLabel>
                            <Input
                              id="chatBaseUrl"
                              value={chatBaseUrl}
                              onChange={(event) => setChatBaseUrl(event.target.value)}
                              placeholder="http://localhost:11434/v1"
                            />
                          </Field>
                        ) : null}
                      </div>
                    ) : null}
                  </section>

                  <Separator />

                  <section className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <LayersIcon className="text-ink-03 size-4" />
                      <h2 className="text-sm font-semibold">Embedding model</h2>
                      <span className="text-ink-03 text-xs">
                        Turns documents into searchable knowledge.
                      </span>
                    </div>
                    <p className="text-ink-02 text-xs">
                      Changing this later means re-indexing everything.
                    </p>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {embeddingProviders.map((provider) => (
                        <ProviderTile
                          key={provider.id}
                          label={provider.label}
                          vendor={provider.selfHosted ? "Self-hosted" : provider.description}
                          selected={embeddingProvider === provider.id}
                          onSelect={() => {
                            setEmbeddingProvider(provider.id);
                            setEmbeddingModel("");
                          }}
                        />
                      ))}
                    </div>

                    {selectedEmbeddingProvider ? (
                      <div className="flex flex-col gap-3 pt-1">
                        <Field>
                          <FieldLabel>Model</FieldLabel>
                          <Select
                            value={embeddingModel}
                            onValueChange={(value) => setEmbeddingModel(value ?? "")}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a model" />
                            </SelectTrigger>
                            <SelectContent>
                              {selectedEmbeddingProvider.embeddingModels.map((model) => (
                                <SelectItem key={model.id} value={model.id}>
                                  {model.label} ({model.dimension}d)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>

                        {embeddingKeyNeeded && embeddingProvider !== chatProvider ? (
                          <Field>
                            <FieldLabel htmlFor="embeddingApiKey">
                              {selectedEmbeddingProvider.label} API key
                            </FieldLabel>
                            <Input
                              id="embeddingApiKey"
                              type="password"
                              value={embeddingApiKey}
                              onChange={(event) => setEmbeddingApiKey(event.target.value)}
                              placeholder="sk-…"
                            />
                          </Field>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                </>
              )}

              <Separator />

              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep("organization")}>
                  <ChevronLeftIcon />
                  Back
                </Button>
                <Button
                  size="lg"
                  disabled={!canSubmit || setup.isPending}
                  onClick={handleSubmit}
                >
                  {setup.isPending ? <Spinner /> : null}
                  Create workspace
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
