"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CpuIcon,
  RepeatIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@onirix/ui/components/button";
import { Input } from "@onirix/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@onirix/ui/components/input-group";
import { Separator } from "@onirix/ui/components/separator";
import { Spinner } from "@onirix/ui/components/spinner";

import { OnirixMark } from "@/components/onirix-mark";
import { trpc } from "@/utils/trpc";

import { ProviderDialog, type Provider } from "./provider-dialog";

/** The lettered tile standing in for a provider logo. */
function ProviderGlyph({ label }: { label: string }) {
  return (
    <span className="bg-tint-02 text-ink-04 flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold">
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function OnboardingView({
  userName,
  organizationName,
}: {
  userName: string;
  organizationName: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [openProvider, setOpenProvider] = useState<Provider | null>(null);

  const providers = useQuery(trpc.onboarding.providers.queryOptions());

  const createWorkspace = useMutation(
    trpc.onboarding.createWorkspace.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries();
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const named = Boolean(organizationName);
  const step = named ? 2 : 1;

  // The deployment's own keys can cover indexing, so a chat provider that
  // serves no embeddings is still connectable on its own.
  const embeddingFallback =
    providers.data?.some(
      (provider) => provider.hasServerKey && provider.embeddingModels.length > 0,
    ) ?? false;

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col px-8 py-10">
        <OnirixMark className="text-ink-04 mb-5 size-8" />
        <h1 className="tracking-hero mb-8 text-3xl font-semibold">
          Let&apos;s get started.
        </h1>

        {/* Where you are, and the one control that moves you on. */}
        <div className="bg-card mb-2 flex items-center gap-3 rounded-xl border px-4 py-3">
          <CircleDashedIcon className="text-ink-02 size-5 shrink-0" />
          <p className="flex-1 text-sm">
            {named
              ? "Almost there! Connect your models to start chatting."
              : "First, tell us what to call your workspace."}
          </p>
          <span className="font-figure text-ink-02 shrink-0">Step {step} of 2</span>
        </div>

        {/* Step one — collapses to a completed row once the workspace exists. */}
        <div className="bg-card mb-2 flex items-center gap-3 rounded-xl border px-4 py-3">
          {named ? (
            <>
              <span className="bg-tint-02 text-ink-04 flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold">
                {userName.slice(0, 1).toUpperCase()}
              </span>
              <span className="flex-1 truncate text-sm font-medium">
                {organizationName}
              </span>
              <CheckCircle2Icon className="text-success size-5 shrink-0" />
            </>
          ) : (
            <>
              <span className="bg-tint-02 text-ink-04 flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold">
                {userName.slice(0, 1).toUpperCase()}
              </span>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && name.trim()) {
                    createWorkspace.mutate({ name: name.trim() });
                  }
                }}
                placeholder="Acme Inc."
                aria-label="Workspace name"
                autoFocus
                className="flex-1"
              />
              <Button
                disabled={name.trim().length === 0 || createWorkspace.isPending}
                onClick={() => createWorkspace.mutate({ name: name.trim() })}
              >
                {createWorkspace.isPending ? <Spinner /> : null}
                Save
                <ArrowRightIcon />
              </Button>
            </>
          )}
        </div>

        {/* Step two — the provider grid. */}
        <section
          className="bg-card mb-6 rounded-xl border data-[locked=true]:opacity-50"
          data-locked={!named}
          aria-disabled={!named}
        >
          <div className="flex items-start gap-3 px-4 py-3.5">
            <CpuIcon className="text-ink-04 mt-0.5 size-5 shrink-0" />
            <div className="flex flex-1 flex-col">
              <h2 className="text-sm font-semibold">Connect your LLM models</h2>
              <p className="text-ink-03 text-xs leading-4">
                Onirix supports both self-hosted models and popular providers.
              </p>
            </div>
          </div>
          <Separator />

          {providers.isPending ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : (
            <div className="grid gap-2 p-3 sm:grid-cols-2">
              {providers.data?.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  disabled={!named}
                  onClick={() => setOpenProvider(provider)}
                  className="hover:bg-tint-01 flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed"
                >
                  <ProviderGlyph label={provider.label} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold">
                      {provider.label}
                    </span>
                    <span className="text-ink-03 truncate text-xs">
                      {provider.selfHosted ? "Self-hosted" : provider.description}
                    </span>
                  </span>
                  <span className="text-ink-03 flex shrink-0 items-center gap-1.5 text-xs">
                    Connect
                    <RepeatIcon className="size-3.5" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* The composer the setup is in aid of, inert until it can answer. */}
        <InputGroup size="lg">
          <InputGroupTextarea
            variant="bare"
            rows={2}
            disabled
            placeholder="Connect a model to start chatting…"
            aria-label="Message"
          />
          <InputGroupAddon align="block-end">
            <Button size="icon-round" disabled aria-label="Send message" className="ml-auto">
              <ArrowRightIcon />
            </Button>
          </InputGroupAddon>
        </InputGroup>
      </div>

      {openProvider ? (
        <ProviderDialog
          provider={openProvider}
          embeddingFallbackAvailable={embeddingFallback}
          embeddingProviders={(providers.data ?? []).filter(
            (candidate) => candidate.embeddingModels.length > 0,
          )}
          onOpenChange={(open) => {
            if (!open) setOpenProvider(null);
          }}
          onConnected={() => {
            setOpenProvider(null);
            void queryClient.invalidateQueries();
            router.push("/chat");
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
