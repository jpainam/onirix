"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@onirix/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@onirix/ui/components/card";
import { Field, FieldDescription, FieldLabel } from "@onirix/ui/components/field";
import { Input } from "@onirix/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@onirix/ui/components/select";
import { Spinner } from "@onirix/ui/components/spinner";

import { trpc } from "@/utils/trpc";

type Step = "organization" | "models";

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
    <div className="mx-auto flex w-full max-w-2xl flex-1 items-center px-4 py-10">
      <Card className="w-full">
        {step === "organization" ? (
          <>
            <CardHeader>
              <CardTitle>Welcome, {userName}</CardTitle>
              <CardDescription>
                Let&apos;s set up your private AI workspace. First, what should we call
                your organization?
              </CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
            <CardFooter className="justify-end">
              <Button
                disabled={organizationName.trim().length === 0}
                onClick={() => setStep("models")}
              >
                Continue
              </Button>
            </CardFooter>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Choose your models</CardTitle>
              <CardDescription>
                Onirix runs on the provider you choose. Pick a self-hosted model to keep
                every request inside your own network. You can change this later.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-6">
              {providers.isPending ? (
                <Spinner />
              ) : (
                <>
                  <Field>
                    <FieldLabel>Chat model</FieldLabel>
                    <FieldDescription>Answers questions and reasons over results.</FieldDescription>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Select
                        value={chatProvider}
                        onValueChange={(value) => {
                          setChatProvider(value ?? "");
                          setChatModel("");
                          setChatBaseUrl(
                            providers.data?.find((p) => p.id === value)?.defaultBaseUrl ?? "",
                          );
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Provider" />
                        </SelectTrigger>
                        <SelectContent>
                          {providers.data?.map((provider) => (
                            <SelectItem key={provider.id} value={provider.id}>
                              {provider.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={chatModel}
                        onValueChange={(value) => setChatModel(value ?? "")}
                        disabled={!selectedChatProvider}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Model" />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedChatProvider?.chatModels.map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedChatProvider ? (
                      <FieldDescription>
                        {selectedChatProvider.description}
                        {selectedChatProvider.hasServerKey
                          ? " An API key is already configured on this deployment."
                          : ""}
                      </FieldDescription>
                    ) : null}
                  </Field>

                  {chatKeyNeeded ? (
                    <Field>
                      <FieldLabel htmlFor="chatApiKey">
                        {selectedChatProvider?.label} API key
                      </FieldLabel>
                      <Input
                        id="chatApiKey"
                        type="password"
                        value={chatApiKey}
                        onChange={(event) => setChatApiKey(event.target.value)}
                        placeholder="sk-..."
                      />
                    </Field>
                  ) : null}

                  {selectedChatProvider?.selfHosted ? (
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

                  <Field>
                    <FieldLabel>Embedding model</FieldLabel>
                    <FieldDescription>
                      Turns your documents into searchable knowledge. Changing this later
                      means re-indexing everything.
                    </FieldDescription>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Select
                        value={embeddingProvider}
                        onValueChange={(value) => {
                          setEmbeddingProvider(value ?? "");
                          setEmbeddingModel("");
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Provider" />
                        </SelectTrigger>
                        <SelectContent>
                          {embeddingProviders.map((provider) => (
                            <SelectItem key={provider.id} value={provider.id}>
                              {provider.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={embeddingModel}
                        onValueChange={(value) => setEmbeddingModel(value ?? "")}
                        disabled={!selectedEmbeddingProvider}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Model" />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedEmbeddingProvider?.embeddingModels.map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.label} ({model.dimension}d)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </Field>

                  {embeddingKeyNeeded && embeddingProvider !== chatProvider ? (
                    <Field>
                      <FieldLabel htmlFor="embeddingApiKey">
                        {selectedEmbeddingProvider?.label} API key
                      </FieldLabel>
                      <Input
                        id="embeddingApiKey"
                        type="password"
                        value={embeddingApiKey}
                        onChange={(event) => setEmbeddingApiKey(event.target.value)}
                        placeholder="sk-..."
                      />
                    </Field>
                  ) : null}
                </>
              )}
            </CardContent>

            <CardFooter className="justify-between">
              <Button variant="ghost" onClick={() => setStep("organization")}>
                Back
              </Button>
              <Button
                disabled={!canSubmit || setup.isPending}
                onClick={handleSubmit}
              >
                {setup.isPending ? <Spinner /> : null}
                Create workspace
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
}
