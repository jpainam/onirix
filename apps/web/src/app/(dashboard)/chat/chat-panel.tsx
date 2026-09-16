"use client";

import { useChat } from "@ai-sdk/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport } from "ai";
import { ArrowUpIcon, PaperclipIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@onirix/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@onirix/ui/components/input-group";
import { Spinner } from "@onirix/ui/components/spinner";

import { OnirixMark } from "@/components/onirix-mark";
import {
  getCitedSources,
  type CitedSource,
  type OnirixUIMessage,
} from "@/lib/chat-message";
import { seedRecentConversation } from "@/lib/recents";
import { trpc } from "@/utils/trpc";

import { AnswerWithCitations, UserMessage } from "./answer";
import { SourcePanel } from "./source-panel";

const SUGGESTIONS = [
  "What is our parental leave policy?",
  "Summarize what we know about our largest customer.",
  "How does our authentication system work?",
];

/** Which citation the reader has open, scoped to the answer that cited it. */
type OpenCitation = { messageId: string; index: number };

export function ChatPanel({
  organizationName,
  modelLabel,
  conversationId = null,
  initialMessages,
}: {
  organizationName: string;
  modelLabel: string;
  /** Set when reopening stored history; null for a fresh session. */
  conversationId?: string | null;
  initialMessages?: OnirixUIMessage[];
}) {
  const queryClient = useQueryClient();
  const [chatId, setChatId] = useState<string | null>(conversationId);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState<OpenCitation | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // A conversation row is created lazily, so an abandoned empty chat never
  // clutters history.
  const createChat = useMutation(trpc.chat.create.mutationOptions());

  const { messages, sendMessage, status, error } = useChat<OnirixUIMessage>({
    messages: initialMessages,
    // The conversation id travels per call rather than on the transport; see
    // `submit` for why reading it from state here would drop the first turn.
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    onFinish: () => {
      // The opening exchange is what names the conversation, and that happens
      // server-side as the answer is persisted — so Recents is only worth
      // refetching once the turn has landed.
      void queryClient.invalidateQueries(trpc.chat.list.queryFilter());
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const busy = status === "streaming" || status === "submitted";
  const started = messages.length > 0;

  // The open citation is stored by id rather than by value so it stays correct
  // as the message it belongs to keeps streaming.
  const openMessage = open
    ? messages.find((message) => message.id === open.messageId)
    : undefined;
  const openSiblings = openMessage ? getCitedSources(openMessage) : [];
  const openSource =
    openSiblings.find((source) => source.index === open?.index) ?? null;

  const selectSource = useCallback(
    (messageId: string, source: CitedSource) =>
      setOpen((current) =>
        // Selecting the citation that is already open closes the panel.
        current?.messageId === messageId && current.index === source.index
          ? null
          : { messageId, index: source.index },
      ),
    [],
  );

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    let id = chatId;
    if (!id) {
      const created = await createChat.mutateAsync();
      id = created.id;
      setChatId(id);
      // The row exists now but is nameless until the answer is persisted, so
      // the sidebar is shown the question in the meantime.
      seedRecentConversation(id, trimmed);
      // Reopening the conversation needs its id in the URL, but a router
      // navigation here would remount this panel and abort the stream that is
      // about to start — so the address bar is corrected in place instead.
      window.history.replaceState(null, "", `/chat/${id}`);
    }

    setInput("");
    // The id is passed per call because `setChatId` above has not re-rendered
    // yet: anything reading `chatId` at this point still sees null, and the
    // server drops a turn that arrives without one.
    sendMessage({ text: trimmed }, { body: { chatId: id } });
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
    <div className="flex h-full min-h-0">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
                        <UserMessage message={message} />
                      </div>
                    </div>
                  ) : (
                    <div key={message.id} className="flex gap-3">
                      <OnirixMark className="text-ink-04 mt-0.5 size-5 shrink-0" />
                      <div className="min-w-0 flex-1 text-sm leading-6">
                        <AnswerWithCitations
                          message={message}
                          activeIndex={
                            open?.messageId === message.id ? open.index : null
                          }
                          onSelectSource={(source) =>
                            selectSource(message.id, source)
                          }
                        />
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

      <SourcePanel
        source={openSource}
        siblings={openSiblings}
        onSelect={(source) =>
          openMessage && selectSource(openMessage.id, source)
        }
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
