"use client";

import { useChat } from "@ai-sdk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport } from "ai";
import { ArrowUpIcon, PanelRightIcon, PaperclipIcon } from "@onirix/ui/lib/icons";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@onirix/ui/components/button";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@onirix/ui/components/ai-elements/conversation";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@onirix/ui/components/input-group";
import { Spinner } from "@onirix/ui/components/spinner";

import { OnirixMark } from "@onirix/ui/brand/onirix-mark";
import {
  getCitedSources,
  getMessageText,
  getRetrievedSources,
  isChartPart,
  isDatabaseQueryPart,
  isDescribeTablesPart,
  isSkillPart,
  type CitedSource,
  type OnirixUIMessage,
} from "@/lib/chat-message";
import { displayTitle } from "@/lib/chat-title";
import { RECENT_CONVERSATIONS_LIMIT, seedRecentConversation } from "@/lib/recents";
import { trpc } from "@/utils/trpc";

import { AnswerWithCitations, UserMessage } from "./answer";
import { DocumentsPane } from "./documents-pane";
import { SideDock, type DockTab } from "./side-dock";
import { SourcePane } from "./source-panel";
import { useSessionDocuments, type SessionDocument } from "./use-session-documents";

const SUGGESTIONS = [
  "What is our parental leave policy?",
  "Summarize what we know about our largest customer.",
  "How does our authentication system work?",
];

/** Which citation the reader has open, scoped to the answer that cited it. */
type OpenCitation = { messageId: string; index: number };

/**
 * What the reader is told while they wait, or null once there is nothing left
 * to say.
 *
 * A single label held for the whole turn was the problem this replaces: it
 * claimed to be searching long after search had finished, through the seconds
 * the model spends composing and then through the answer itself. The server
 * sends the retrieved sources before the first token precisely so this can
 * move on, and once prose is arriving the answer is its own progress report.
 */
function retrievalProgress(
  messages: OnirixUIMessage[],
  busy: boolean,
): string | null {
  if (!busy) return null;

  const latest = messages.at(-1);
  if (!latest || latest.role !== "assistant") return "Searching your knowledge…";

  // Anything the reader can already see says more than a label would.
  if (getMessageText(latest).trim().length > 0) return null;
  // A chart draws its own skeleton while it streams, so a label beside it would
  // be saying twice what the page already shows once.
  if (latest.parts.some(isChartPart)) return null;
  // A query draws its own "Querying…" line while it runs.
  if (latest.parts.some(isDatabaseQueryPart)) return null;

  // Reading a schema is a round trip with nothing to render, like a skill.
  if (latest.parts.some(isDescribeTablesPart)) return "Reading the database schema…";

  // Loading a skill is a whole round trip with nothing to render, so it is the
  // one step that would otherwise leave the reader watching an empty screen.
  if (latest.parts.some(isSkillPart)) return "Consulting guidance…";

  const sources = getRetrievedSources(latest);
  if (sources.length === 0) return "Searching your knowledge…";

  return sources.length === 1
    ? "Reading 1 source…"
    : `Reading ${sources.length} sources…`;
}

export function ChatPanel({
  organizationName,
  modelLabel,
  conversationId = null,
  title = null,
  initialMessages,
  resume = false,
}: {
  organizationName: string;
  /** Null while the workspace has no model connected. */
  modelLabel: string | null;
  /** Set when reopening stored history; null for a fresh session. */
  conversationId?: string | null;
  /** The stored name, if it has one yet. */
  title?: string | null;
  initialMessages?: OnirixUIMessage[];
  /**
   * Set when the conversation was still being answered as the page rendered,
   * which is how a reader who refreshed mid-answer gets it back.
   */
  resume?: boolean;
}) {
  const queryClient = useQueryClient();
  // Minted here rather than on the server so the conversation has an identity
  // from the first keystroke. `useChat` keys its state on this id and rebuilds
  // from scratch when it changes, so an id that only appeared once the row had
  // been created would throw away the turn it was created for.
  const [chatId] = useState(() => conversationId ?? crypto.randomUUID());
  // The row behind that id is created lazily, so an abandoned empty chat never
  // clutters history.
  const [created, setCreated] = useState(conversationId !== null);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submissionPending = useRef(false);
  const uploadPending = useRef(false);
  const [open, setOpen] = useState<OpenCitation | null>(null);
  // Raised by trying to send with no model connected, and only then: a
  // workspace without one stays fully open to look around in, so this is the
  // first moment the missing model actually stands in anyone's way.
  const [needsModel, setNeedsModel] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [dockTab, setDockTab] = useState<DockTab>("documents");
  const fileInput = useRef<HTMLInputElement>(null);

  const createChat = useMutation(trpc.chat.create.mutationOptions());
  const sessionDocuments = useSessionDocuments(chatId, created);

  // The sidebar already keeps this list fresh, and it is where a name lands
  // once the opening exchange has produced one, so the header reads it from
  // there rather than asking again.
  const recents = useQuery({
    ...trpc.chat.list.queryOptions({ limit: RECENT_CONVERSATIONS_LIMIT }),
    enabled: created,
  });
  const heading = created
    ? displayTitle(recents.data?.find((row) => row.id === chatId)?.title ?? title)
    : // Nothing to name yet, so the row stays blank rather than labelling
      // an empty page.
      "";

  const { messages, sendMessage, resumeStream, status, error } = useChat<OnirixUIMessage>({
    // Also what the transport reconnects on: `resume` fetches
    // `/api/chat/<id>/stream`, which only resolves to an answer if this is the
    // id the server is writing one under.
    id: chatId,
    messages: initialMessages,
    resume,
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    onFinish: () => {
      // The opening exchange is what names the conversation, and that happens
      // server-side as the answer is persisted — so Recents is only worth
      // refetching once the turn has landed.
      void queryClient.invalidateQueries(trpc.chat.list.queryFilter());
    },
  });

  // A connection that drops mid-answer surfaces here as an error, but the
  // server carries on writing. Re-attaching the moment the network is back
  // finishes the answer in place, so recovering does not depend on the reader
  // thinking to refresh.
  useEffect(() => {
    if (status !== "error") return;
    const reattach = () => void resumeStream();
    window.addEventListener("online", reattach);
    return () => window.removeEventListener("online", reattach);
  }, [status, resumeStream]);

  const busy = status === "streaming" || status === "submitted";
  const started = messages.length > 0;
  const progress = retrievalProgress(messages, busy);

  // The open citation is stored by id rather than by value so it stays correct
  // as the message it belongs to keeps streaming.
  const openMessage = open
    ? messages.find((message) => message.id === open.messageId)
    : undefined;
  const openSiblings = openMessage ? getCitedSources(openMessage) : [];
  const openSource =
    openSiblings.find((source) => source.index === open?.index) ?? null;

  const selectSource = useCallback(
    (messageId: string, source: CitedSource) => {
      // Selecting the citation that is already showing closes the panel.
      const showing =
        dockOpen &&
        dockTab === "source" &&
        open?.messageId === messageId &&
        open.index === source.index;

      setOpen(showing ? null : { messageId, index: source.index });
      setDockTab("source");
      setDockOpen(!showing);
    },
    [dockOpen, dockTab, open],
  );

  function changeDockOpen(next: boolean) {
    setDockOpen(next);
    // A citation is only marked as open while its passage is on screen.
    if (!next) setOpen(null);
  }

  /** The header's one control: it shuts the panel, or opens it on Documents. */
  function toggleDocuments() {
    if (dockOpen) return changeDockOpen(false);
    setDockTab("documents");
    setDockOpen(true);
  }

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || submissionPending.current || uploadPending.current) return;

    if (modelLabel === null) {
      // Nothing is sent or stored, and what was typed stays in the composer
      // for when there is a model to answer it.
      setNeedsModel(true);
      return;
    }

    submissionPending.current = true;
    setSubmitting(true);
    setNeedsModel(false);
    try {
      if (!created) {
        await createChat.mutateAsync({ id: chatId });
        // Documents attached before there was a conversation to attach them to
        // are written now, ahead of the message, so this first answer already
        // reads them.
        await sessionDocuments.flush();
        setCreated(true);
        // The row exists now but is nameless until the answer is persisted, so
        // the sidebar is shown the question in the meantime.
        seedRecentConversation(chatId, trimmed);
        // Reopening the conversation needs its id in the URL, but a router
        // navigation here would remount this panel and abort the stream that is
        // about to start — so the address bar is corrected in place instead.
        window.history.replaceState(null, "", `/chat/${chatId}`);
      }

      setInput("");
      // Sent in the body as well as on the transport: the server has to look the
      // conversation up to check it is the caller's before it generates anything.
      await sendMessage({ text: trimmed }, { body: { chatId } });
    } catch {
      toast.error("Could not send your message. Please try again.");
      setInput((current) => current || text);
    } finally {
      submissionPending.current = false;
      setSubmitting(false);
    }
  }

  async function attach(files: FileList | File[] | null) {
    if (!files || files.length === 0 || uploadPending.current || submissionPending.current) return;

    const formData = new FormData();
    for (const file of files) formData.append("files", file);

    uploadPending.current = true;
    setUploading(true);
    try {
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error ?? "Upload failed.");
        return;
      }
      const accepted: { id: string; title: string }[] = result.accepted ?? [];
      if (accepted.length > 0) {
        // An upload from a conversation belongs to that conversation: it is
        // attached here and shown in the panel, where its progress is visible,
        // rather than announced and then left for the reader to go and find.
        await sessionDocuments.attach(
          accepted.map(
            (row): SessionDocument => ({ ...row, status: "pending" }),
          ),
        );
        setDockTab("documents");
        setDockOpen(true);
      }
      for (const rejected of result.rejected ?? []) {
        toast.error(`${rejected.name}: ${rejected.reason}`);
      }
    } catch {
      toast.error("Could not upload your files. Please try again.");
    } finally {
      uploadPending.current = false;
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const missingModel = needsModel && modelLabel === null ? (
    <div
      role="alert"
      className="bg-warning-subtle mb-2 flex w-full items-center gap-3 rounded-xl px-4 py-3"
    >
      <p className="text-ink-04 min-w-0 flex-1 text-sm">
        No language model is set up.
      </p>
      <Button
        size="sm"
        nativeButton={false}
        render={<Link href="/onboarding" />}
      >
        Set up a model
      </Button>
    </div>
  ) : null;

  const composer = (
    <InputGroup size="lg">
      <InputGroupTextarea
        variant="bare"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends; Shift+Enter inserts a newline.
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
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
          disabled={uploading || submitting}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? <Spinner /> : <PaperclipIcon />}
        </Button>
        <Button
          size="icon-round"
          aria-label="Send message"
          disabled={busy || submitting || uploading || input.trim().length === 0}
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
        {/* The one row of chrome a conversation has. With the sidebar closed it
            makes room on its left for the controls that reopen it, and in the
            desktop window it is the handle the window is dragged by; both are
            arranged in globals.css, keyed on this slot. */}
        <header
          data-slot="shell-header"
          className="flex h-shell shrink-0 items-center gap-2 border-b pr-2 pl-4"
        >
          <h1 className="text-ink-04 min-w-0 flex-1 truncate text-sm font-medium">
            {heading}
          </h1>
          <Button
            variant="muted"
            size="icon-sm"
            aria-label="Documents"
            aria-pressed={dockOpen}
            title="Documents"
            onClick={toggleDocuments}
          >
            <PanelRightIcon />
          </Button>
        </header>

        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(event) => void attach(event.target.files)}
        />

        {started ? (
          <>
            {/* Autoscroll is delegated rather than hand-rolled: an effect that
                re-aimed at `scrollHeight` on every streamed chunk kept
                restarting a smooth animation toward a target the next chunk had
                already moved, which read as the page juddering up and down for
                the length of a long answer. This sticks to the bottom only
                while the reader is already there, and yields the moment they
                scroll up to re-read something. */}
            <Conversation className="min-h-0 flex-1">
              <ConversationContent className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-6 py-8">
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
                {progress ? (
                  <div className="flex gap-3">
                    <OnirixMark className="text-ink-02 mt-0.5 size-5 shrink-0 animate-pulse" />
                    <span className="text-ink-03 text-sm">{progress}</span>
                  </div>
                ) : null}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>

            <div className="shrink-0 px-6 pb-4">
              <div className="mx-auto w-full max-w-3xl">
                {error ? (
                  <p className="text-destructive mb-2 text-sm" role="alert">
                    {error.message}
                  </p>
                ) : null}
                {missingModel}
                {composer}
                {modelLabel ? (
                  <p className="text-ink-02 mt-2 text-center text-xs">
                    Answering with {modelLabel}
                  </p>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          /* The empty state is the page, not a panel inside it: the greeting and
             the composer sit together in the optical centre. */
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-10">
            <div className="flex w-full max-w-2xl flex-col items-center">
              <OnirixMark className="text-ink-04 mb-5 size-8" />
              <h2 className="mb-8 text-3xl font-semibold tracking-hero">
                How can I help?
              </h2>

              {error ? (
                <p className="text-destructive mb-2 self-start text-sm" role="alert">
                  {error.message}
                </p>
              ) : null}

              {missingModel}
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
                Grounded in {organizationName}&apos;s knowledge
                {modelLabel ? ` \u00b7 ${modelLabel}` : ""}
              </p>
            </div>
          </div>
        )}
      </div>

      <SideDock
        open={dockOpen}
        onOpenChange={changeDockOpen}
        tab={dockTab}
        onTabChange={setDockTab}
        documentCount={sessionDocuments.documents.length}
        panes={{
          documents: (
            <DocumentsPane
              documents={sessionDocuments.documents}
              uploading={uploading}
              onUpload={(files) => void attach(files)}
              onAttach={(document) => void sessionDocuments.attach([document])}
              onDetach={(documentId) => void sessionDocuments.detach(documentId)}
            />
          ),
          source: (
            <SourcePane
              source={openSource}
              siblings={openSiblings}
              onSelect={(source) =>
                openMessage && setOpen({ messageId: openMessage.id, index: source.index })
              }
            />
          ),
        }}
      />
    </div>
  );
}
