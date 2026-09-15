"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useMutation } from "@tanstack/react-query";
import { SendIcon, SparklesIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@onirix/ui/components/badge";
import { Button } from "@onirix/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@onirix/ui/components/empty";
import { Spinner } from "@onirix/ui/components/spinner";
import { Textarea } from "@onirix/ui/components/textarea";

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
  const [chatId, setChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const busy = status === "streaming" || status === "submitted";

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    let id = chatId;
    if (!id) {
      const created = await createChat.mutateAsync();
      id = created.id;
      setChatId(id);
    }

    setInput("");
    sendMessage({ text: trimmed });
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SparklesIcon />
              </EmptyMedia>
              <EmptyTitle>Ask {organizationName} anything</EmptyTitle>
              <EmptyDescription>
                Onirix searches your connected knowledge and answers with citations you
                can open.
              </EmptyDescription>
            </EmptyHeader>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  onClick={() => submit(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </Empty>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-4">
            {messages.map((message) => (
              <div key={message.id} className="flex flex-col gap-2">
                <Badge variant={message.role === "user" ? "secondary" : "outline"}>
                  {message.role === "user" ? "You" : "Onirix"}
                </Badge>
                <AnswerWithCitations message={message} />
              </div>
            ))}
            {busy ? <Spinner /> : null}
          </div>
        )}
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error.message}
        </p>
      ) : null}

      <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter inserts a newline.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit(input);
            }
          }}
          placeholder={`Ask about ${organizationName}...`}
          rows={2}
          className="resize-none"
        />
        <Button
          size="icon"
          disabled={busy || input.trim().length === 0}
          onClick={() => void submit(input)}
          aria-label="Send message"
        >
          <SendIcon />
        </Button>
      </div>
      <p className="text-muted-foreground mx-auto text-xs">Answering with {modelLabel}</p>
    </div>
  );
}
