"use client";

import { useChat } from "@ai-sdk/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport } from "ai";
import { ArrowUpIcon, PaperclipIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@onirix/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@onirix/ui/components/input-group";
import { Spinner } from "@onirix/ui/components/spinner";

import { OnirixMark } from "@/components/onirix-mark";
import { trpc } from "@/utils/trpc";

import { AnswerWithCitations } from "./answer";

const SUGGESTIONS = [
  "What is our parental leave policy?",
  "Summarize what we know about our largest customer.",
  "How does our authentication system work?",
];

export function ChatPanel({
  organizationName,
  modelLabel,
}: {
  organizationName: string;
  modelLabel: string;
}) {
  const queryClient = useQueryClient();
  const [chatId, setChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // A conversation row is created lazily, so an abandoned empty chat never
  // clutters history.
  const createChat = useMutation(trpc.chat.create.mutationOptions());

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({ chatId }),
    }),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const busy = status === "streaming" || status === "submitted";
  const started = messages.length > 0;

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    let id = chatId;
    if (!id) {
      const created = await createChat.mutateAsync();
      id = created.id;
      setChatId(id);
      // The sidebar's Recents list is now stale.
      void queryClient.invalidateQueries();
    }

    setInput("");
    sendMessage({ text: trimmed });
  }

  async function attach(files: FileList | null) {
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (const file of files) formData.append("files", file);

    setUploading(true);
    try {
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error ?? "Upload failed.");
        return;
      }
      if (result.accepted?.length > 0) {
        toast.success(
          `Indexing ${result.accepted.length} file(s). They will be searchable shortly.`,
        );
      }
      for (const rejected of result.rejected ?? []) {
        toast.error(`${rejected.name}: ${rejected.reason}`);
      }
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const composer = (
    <InputGroup size="lg">
      <InputGroupTextarea
        variant="bare"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends; Shift+Enter inserts a newline.
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit(input);
          }
        }}
        placeholder={`Ask about ${organizationName}…`}
        rows={2}
      />
      <InputGroupAddon align="block-end">
        <Button
          variant="muted"
          size="icon-sm"
          aria-label="Attach files"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? <Spinner /> : <PaperclipIcon />}
        </Button>
        <Button
          size="icon-round"
          aria-label="Send message"
          disabled={busy || input.trim().length === 0}
          onClick={() => void submit(input)}
          className="ml-auto"
        >
          <ArrowUpIcon />
        </Button>
      </InputGroupAddon>
    </InputGroup>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(event) => void attach(event.target.files)}
      />

      {started ? (
        <>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-6 py-8">
              {messages.map((message) =>
                message.role === "user" ? (
                  <div key={message.id} className="flex justify-end">
                    <div className="bg-tint-02 max-w-2xl rounded-2xl px-4 py-2.5 text-sm">
                      <AnswerWithCitations message={message} />
                    </div>
                  </div>
                ) : (
                  <div key={message.id} className="flex gap-3">
                    <OnirixMark className="text-ink-04 mt-0.5 size-5 shrink-0" />
                    <div className="min-w-0 flex-1 text-sm leading-6">
                      <AnswerWithCitations message={message} />
                    </div>
                  </div>
                ),
              )}
              {busy ? (
                <div className="flex gap-3">
                  <OnirixMark className="text-ink-02 mt-0.5 size-5 shrink-0 animate-pulse" />
                  <span className="text-ink-03 text-sm">Searching your knowledge…</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="shrink-0 px-6 pb-4">
            <div className="mx-auto w-full max-w-3xl">
              {error ? (
                <p className="text-destructive mb-2 text-sm" role="alert">
                  {error.message}
                </p>
              ) : null}
              {composer}
              <p className="text-ink-02 mt-2 text-center text-xs">
                Answering with {modelLabel}
              </p>
            </div>
          </div>
        </>
      ) : (
        /* The empty state is the page, not a panel inside it: the greeting and
           the composer sit together in the optical centre. */
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-10">
          <div className="flex w-full max-w-2xl flex-col items-center">
            <OnirixMark className="text-ink-04 mb-5 size-8" />
            <h1 className="mb-8 text-3xl font-semibold tracking-hero">
              How can I help?
            </h1>

            {error ? (
              <p className="text-destructive mb-2 self-start text-sm" role="alert">
                {error.message}
              </p>
            ) : null}

            {composer}

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void submit(suggestion)}
                  className="bg-card text-ink-03 hover:bg-tint-01 hover:text-ink-04 rounded-full border px-3 py-1.5 text-xs transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <p className="text-ink-02 mt-8 text-xs">
              Grounded in {organizationName}&apos;s knowledge · {modelLabel}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
