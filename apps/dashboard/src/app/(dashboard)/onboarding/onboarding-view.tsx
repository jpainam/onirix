"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CpuIcon,
  MailOpenIcon,
  RepeatIcon,
} from "@onirix/ui/lib/icons";
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

import { OnirixMark } from "@onirix/ui/brand/onirix-mark";
import { ProviderDialog, type Provider } from "@/components/provider-dialog";
import { trpc } from "@/utils/trpc";

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

  // Asked only while the caller has no workspace: someone who already belongs
  // to one has taken their path, and an invitation cannot change it.
  const invitations = useQuery({
    ...trpc.onboarding.myInvitations.queryOptions(),
    enabled: !organizationName,
  });

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

  const invited = invitations.data ?? [];

  // An invited user has a workspace waiting, so they are never asked to name
  // one — creating a second tenant would strand the invitation and split their
  // colleagues across two workspaces that cannot see each other. Acceptance
  // itself lives on the invitation page, which is also what the emailed link
  // opens, so there is one code path for joining however you arrived.
  if (!named && invited.length > 0) {
    return (
      <div className="h-full min-h-0 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col px-8 py-10">
          <OnirixMark className="text-ink-04 mb-5 size-8" />
          <h1 className="tracking-hero mb-2 text-3xl font-semibold">
            You&apos;ve been invited.
          </h1>
          <p className="text-ink-03 mb-8 text-sm">
            {invited.length === 1
              ? "Accept to see what your colleagues have shared with you."
              : "Accept one to get started; the others will keep waiting."}
          </p>

          <div className="flex flex-col gap-2">
            {invited.map((invitation) => (
              <div
                key={invitation.id}
                className="bg-card flex items-center gap-3 rounded-xl border px-4 py-3"
              >
                <MailOpenIcon className="text-ink-04 size-5 shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">
                    {invitation.organizationName}
                  </span>
                  <span className="text-ink-03 truncate text-xs">
                    Invited by {invitation.inviterName} as {invitation.role}
                  </span>
                </span>
                <Button
                  className="shrink-0"
                  onClick={() => router.push(`/accept-invitation/${invitation.id}`)}
                >
                  Join
                  <ArrowRightIcon />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

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
          ) : invitations.isPending ? (
            <div className="flex w-full justify-center py-1">
              <Spinner />
            </div>
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

        {/* Setup never stands in the way of looking around. Skipping needs a
            workspace to look around in, so it is offered once one is named;
            the missing model is raised later, by the first message sent. */}
        {named ? (
          <div className="mb-6 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/chat" />}
            >
              Skip for now
            </Button>
          </div>
        ) : null}

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
          settlesEmbedding
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
