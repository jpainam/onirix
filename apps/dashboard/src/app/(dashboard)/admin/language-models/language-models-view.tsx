"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleCheckIcon,
  CpuIcon,
  LayersIcon,
  RepeatIcon,
  SettingsIcon,
  TriangleAlertIcon,
} from "@onirix/ui/lib/icons";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@onirix/ui/components/alert-dialog";
import { Badge } from "@onirix/ui/components/badge";
import { Button } from "@onirix/ui/components/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@onirix/ui/components/select";
import { Spinner } from "@onirix/ui/components/spinner";

import { Page, PageHeader, Row, Section } from "@/components/page";
import {
  ProviderDialog,
  type ConnectedProvider,
  type Provider,
} from "@/components/provider-dialog";
import { ProviderLogo } from "@/components/provider-logo";
import { ResetSettings } from "@/components/reset-settings";
import { trpc } from "@/utils/trpc";

/** The default model is one value in the picker: provider and model together. */
function encode(provider: string, model: string) {
  return `${provider}:${model}`;
}

/**
 * Providers, the models enabled on each, and the one answers default to.
 *
 * The page is a list you add to rather than a report on the single provider
 * chosen at setup: a workspace can hold OpenAI and Anthropic side by side and
 * move its default between them. Embeddings are the exception, pinned to the
 * search index and so shown but not editable.
 */
export function LanguageModelsView({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<Provider | null>(null);
  const [disconnecting, setDisconnecting] = useState<Provider | null>(null);

  const overview = useQuery(trpc.models.overview.queryOptions());
  const catalog = useQuery(trpc.onboarding.providers.queryOptions());

  const setDefault = useMutation(
    trpc.models.setDefault.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries();
        toast.success("Default model updated.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const disconnect = useMutation(
    trpc.models.disconnect.mutationOptions({
      onSuccess: () => {
        setDisconnecting(null);
        void queryClient.invalidateQueries();
        toast.success("Provider disconnected.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const connected = overview.data?.providers ?? [];
  const connectedIds = new Set(connected.map((provider) => provider.id));
  const available = (catalog.data ?? []).filter(
    (provider) => !connectedIds.has(provider.id),
  );

  const current = overview.data?.default;
  const embedding = overview.data?.embedding;

  /** Catalog entry behind a connected row, for the settings dialog. */
  const editingConnection: ConnectedProvider | null = editing
    ? (() => {
        const row = connected.find((provider) => provider.id === editing.id);
        return row
          ? {
              models: row.models.map((model) => model.id),
              autoUpdateModels: row.autoUpdateModels,
              hasApiKey: row.hasApiKey,
              baseUrl: row.baseUrl,
            }
          : null;
      })()
    : null;

  return (
    <Page>
      <PageHeader
        title="Language model"
        description="Connect providers and choose the model your workspace answers with."
      />

      {overview.isPending ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          <Section>
            <Row
              icon={<CpuIcon />}
              title="Default model"
              description="Used for every new chat in this workspace."
              action={
                <Select
                  value={current ? encode(current.provider, current.model) : ""}
                  disabled={!canManage || setDefault.isPending}
                  onValueChange={(value) => {
                    const [provider, ...rest] = String(value).split(":");
                    setDefault.mutate({
                      provider: provider as Provider["id"],
                      model: rest.join(":"),
                    });
                  }}
                >
                  <SelectTrigger className="min-w-52">
                    <SelectValue placeholder="Choose a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {connected.map((provider) => (
                      <SelectGroup key={provider.id}>
                        <SelectLabel>{provider.label}</SelectLabel>
                        {provider.models.map((model) => (
                          <SelectItem
                            key={model.id}
                            value={encode(provider.id, model.id)}
                          >
                            {model.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
          </Section>

          <Section
            title="Connected providers"
            description="Every model enabled here can be picked as the default."
          >
            <div className="flex flex-col gap-2">
              {connected.map((provider) => {
                const entry = catalog.data?.find(
                  (candidate) => candidate.id === provider.id,
                );
                return (
                  <Row
                    key={provider.id}
                    icon={<ProviderLogo id={provider.id} label={provider.label} />}
                    title={
                      <span className="flex items-center gap-2">
                        {provider.label}
                        {current?.provider === provider.id ? (
                          <Badge variant="muted">Default</Badge>
                        ) : null}
                        {/* A key-less connection is inert: nothing it offers
                            can be called until someone pastes one in. */}
                        {provider.needsApiKey ? (
                          <Badge variant="warning">
                            <TriangleAlertIcon />
                            Key required
                          </Badge>
                        ) : null}
                      </span>
                    }
                    description={[
                      `${provider.models.length} model${provider.models.length === 1 ? "" : "s"}`,
                      provider.baseUrl ?? (provider.hasApiKey ? "API key stored" : null),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    action={
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${provider.label} settings`}
                        disabled={!canManage || !entry}
                        onClick={() => entry && setEditing(entry)}
                      >
                        <SettingsIcon />
                      </Button>
                    }
                  />
                );
              })}
            </div>
          </Section>

          {canManage ? (
            <Section
              title="Add provider"
              description="Onirix supports both popular providers and self-hosted models."
            >
              {available.length === 0 ? (
                <p className="text-ink-03 text-sm">
                  Every provider Onirix supports is already connected.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {available.map((provider) => (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => setEditing(provider)}
                      className="bg-card hover:bg-tint-01 flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors"
                    >
                      <ProviderLogo id={provider.id} label={provider.label} />
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
            </Section>
          ) : null}

          {embedding ? (
            <Section title="Embedding model">
              <Row
                icon={<LayersIcon />}
                title={embedding.model}
                description={`${embedding.provider} · ${embedding.dimension} dimensions`}
                action={
                  <Badge variant="success">
                    <CircleCheckIcon />
                    Connected
                  </Badge>
                }
              />
              <p className="text-ink-02 text-xs">
                Changing the embedding model requires re-indexing all documents.
              </p>
            </Section>
          ) : null}

          {canManage ? (
            <Section
              title="Danger zone"
              description="Restart model setup without deleting workspace data."
            >
              <ResetSettings />
            </Section>
          ) : null}
        </div>
      )}

      {editing ? (
        <ProviderDialog
          provider={editing}
          connected={editingConnection}
          embeddingProviders={(catalog.data ?? []).filter(
            (candidate) => candidate.embeddingModels.length > 0,
          )}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onConnected={() => {
            setEditing(null);
            void queryClient.invalidateQueries();
            toast.success("Provider saved.");
          }}
          onDisconnect={() => {
            setDisconnecting(editing);
            setEditing(null);
          }}
        />
      ) : null}

      <AlertDialog
        open={Boolean(disconnecting)}
        onOpenChange={(open) => {
          if (!open) setDisconnecting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Disconnect {disconnecting?.label}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Its API key is deleted and its models can no longer be used. Chats and
              documents are untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel render={<Button variant="outline" />}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={disconnect.isPending}
              onClick={() =>
                disconnecting && disconnect.mutate({ provider: disconnecting.id })
              }
            >
              {disconnect.isPending ? <Spinner /> : null}
              Disconnect
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
