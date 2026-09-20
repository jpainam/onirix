/**
 * One conversation, or the empty page a new session starts from.
 *
 * Laid out like the dashboard's chat panel: one header row (which the window
 * is dragged by on macOS), a reading column with the composer under it, and on
 * the right the dock that holds this session's documents and the passage
 * behind a citation. The dock is what makes this Onirix rather than a chat
 * box: answers read the person's own files and show where each claim is from.
 *
 * The composer is never disabled for want of a model. Someone who skipped
 * setup can type and send like anyone else; what comes back is a plain note
 * in the conversation that no model is set up, with the button that fixes it.
 */
import { DOCUMENT_ACCEPT } from "@onirix/ui/lib/folder-files";
import { ArrowUpIcon, PanelRightIcon, PaperclipIcon, SquareIcon } from "@onirix/ui/lib/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { OnirixMark } from "@onirix/ui/brand/onirix-mark";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@onirix/ui/components/ai-elements/conversation";
import { Button } from "@onirix/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@onirix/ui/components/input-group";

import { Spinner } from "@onirix/ui/components/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@onirix/ui/components/tooltip";

import {
  type Chat,
  type ChatFailure,
  LIMITS,
  type LibraryDocument,
  type MessageSource,
  type ModelChoice,
} from "../src/local-bridge";

import { Answer } from "./answer";
import { addDocuments, errorMessage, getBridge } from "./bridge";
import { citedIndices } from "./citations";
import { DocumentsPane } from "./documents-pane";
import { modelLabel } from "./model-label";
import { type DockTab, SideDock } from "./side-dock";
import { SourcePane } from "./source-pane";

/** Which passage is open in the dock: a source of one particular answer. */
type OpenSource = { messageId: string; index: number };

const DOCK_OPEN_KEY = "onirix:dock-open";

/**
 * The dock starts open: documents are the point of the product, and a closed
 * panel behind an icon is a feature nobody finds. Once the person has opened
 * or closed it themselves, their choice is what it starts as. In a window too
 * narrow to hold both columns comfortably it starts closed regardless.
 */
function initialDockOpen(): boolean {
  try {
    const stored = window.localStorage.getItem(DOCK_OPEN_KEY);
    if (stored !== null) return stored === "true";
  } catch {
    // No storage: fall through to the default.
  }
  return window.innerWidth >= 1100;
}

/** The answer still arriving has no id yet; this stands in for one. */
const STREAMING_ID = "streaming";

export function ChatView({
  banner,
  chatId,
  chat,
  streamingText,
  streamingSources,
  failure,
  model,
  library,
  onLibraryChange,
  onChatChange,
  onSend,
  onRetry,
  onCancel,
  onSetUpModel,
}: {
  /** A notice from the shell, shown under the header row. */
  banner: React.ReactNode;
  /** The selected conversation, including while its contents are loading. */
  chatId: string | null;
  /** Null on the new-session page. */
  chat: Chat | null;
  /** The answer so far while one is arriving, otherwise undefined. */
  streamingText: string | undefined;
  /** The passages the arriving answer was given, so its chips work as it streams. */
  streamingSources: MessageSource[];
  failure: ChatFailure | null;
  model: ModelChoice | null;
  library: LibraryDocument[];
  /** The library changed on disk (a file added or deleted): read it again. */
  onLibraryChange: () => Promise<void>;
  /** The chat changed without a message being sent (a document attached). */
  onChatChange: (chat: Chat) => void;
  /** `documentIds` only matters for a new session, which has no chat to hold them. */
  onSend: (text: string, documentIds: string[]) => Promise<boolean>;
  onRetry: () => void;
  onCancel: () => void;
  onSetUpModel: () => void;
}) {
  const [input, setInput] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const streaming = streamingText !== undefined;
  const loading = chatId !== null && chat === null;
  const [sending, setSending] = useState(false);
  const sendPending = useRef(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const selectedChat = useRef(chatId);
  selectedChat.current = chatId;

  const [dockOpen, setDockOpenState] = useState(initialDockOpen);
  const setDockOpen = useCallback((open: boolean) => {
    setDockOpenState(open);
    try {
      window.localStorage.setItem(DOCK_OPEN_KEY, String(open));
    } catch {
      // Without storage the choice still holds until the window is closed.
    }
  }, []);
  const [dockTab, setDockTab] = useState<DockTab>("documents");
  const [openSource, setOpenSource] = useState<OpenSource | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const attachInput = useRef<HTMLInputElement>(null);

  // A chat is only written when its first message is sent, so that an empty
  // one never reaches the sidebar. Documents can be attached before then, which
  // leaves nothing to attach them to: those are held here and travel with the
  // first message. Callers see one list either way.
  const [held, setHeld] = useState<string[]>([]);
  const previousChatId = useRef(chatId);

  useEffect(() => {
    const from = previousChatId.current;
    previousChatId.current = chatId;
    setInput("");
    setOpenSource(null);
    setAddError(null);
    setSendError(null);
    field.current?.focus();
    // From a new session into the chat it just became, the dock stays as it
    // was: the person attached a file and asked about it, and is still looking
    // at both. Any other move is to a different conversation.
    if (from === null && chatId !== null) return;
    setHeld([]);
    setDockTab("documents");
  }, [chatId]);

  const attachedIds = chat ? chat.documentIds : held;
  const attached = useMemo(
    () =>
      attachedIds
        .map((id) => library.find((row) => row.id === id))
        // A document deleted from the library simply stops being listed.
        .filter((row): row is LibraryDocument => row !== undefined),
    [attachedIds, library],
  );

  const attach = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      if (!chat) {
        setHeld((current) => [...new Set([...current, ...ids])]);
        return;
      }
      onChatChange(await getBridge().chats.attach(chat.id, ids));
    },
    [chat, onChatChange],
  );

  async function detach(id: string) {
    if (!chat) {
      setHeld((current) => current.filter((entry) => entry !== id));
      return;
    }
    onChatChange(await getBridge().chats.detach(chat.id, id));
  }

  /** A file added from a conversation belongs to that conversation. */
  async function addFiles(files: File[]) {
    if (files.length === 0 || adding) return;
    setAdding(true);
    setAddError(null);
    setDockTab("documents");
    setDockOpen(true);
    try {
      // Attached a call at a time, so a folder fills the panel as it is read.
      const result = await addDocuments(files, async (batch) => {
        await onLibraryChange();
        await attach(batch.documents.map((row) => row.id));
      });
      if (result.refused.length > 0) setAddError(result.refused.join(" "));
    } catch (failure) {
      setAddError(errorMessage(failure));
    } finally {
      setAdding(false);
    }
  }

  async function deleteFromLibrary(id: string) {
    await getBridge().documents.remove(id);
    await onLibraryChange();
  }

  const selectSource = useCallback(
    (messageId: string, source: MessageSource) => {
      const same = openSource?.messageId === messageId && openSource.index === source.index;
      // A second press on the open chip closes the panel it opened.
      if (same && dockOpen && dockTab === "source") {
        setDockOpen(false);
        setOpenSource(null);
        return;
      }
      setDockTab("source");
      setDockOpen(true);
      setOpenSource({ messageId, index: source.index });
    },
    [openSource, dockOpen, dockTab, setDockOpen],
  );

  function toggleDock() {
    if (dockOpen) return setDockOpen(false);
    setDockTab("documents");
    setDockOpen(true);
  }

  async function submit() {
    const text = input.trim();
    if (!text || streaming || loading || adding || sendPending.current) return;
    sendPending.current = true;
    setSending(true);
    setSendError(null);
    try {
      if (await onSend(text, held)) {
        if (selectedChat.current === chatId) {
          setInput((current) => current.trim() === text ? "" : current);
        }
      }
    } catch (failure) {
      if (selectedChat.current === chatId) setSendError(errorMessage(failure));
    } finally {
      sendPending.current = false;
      setSending(false);
    }
  }

  const messages = chat?.messages ?? [];

  // A citation opened mid-answer belongs to the saved answer once it lands.
  const lastMessage = messages.at(-1);
  useEffect(() => {
    if (streaming || lastMessage?.role !== "assistant") return;
    setOpenSource((current) => current?.messageId === STREAMING_ID
      ? { ...current, messageId: lastMessage.id }
      : current);
  }, [streaming, lastMessage?.id, lastMessage?.role]);

  // The open passage, and the cited ones of the same answer to step through.
  const openSources =
    openSource?.messageId === STREAMING_ID
      ? { sources: streamingSources, text: streamingText ?? "" }
      : (() => {
          const owner = messages.find((message) => message.id === openSource?.messageId);
          return { sources: owner?.sources ?? [], text: owner?.text ?? "" };
        })();
  const activeSource =
    openSources.sources.find((source) => source.index === openSource?.index) ?? null;
  const siblings = (() => {
    const cited = citedIndices(openSources.text);
    return openSources.sources.filter((source) => cited.has(source.index));
  })();
  // A question with nothing under it: asked before a model was set up, or cut
  // off by a failure or by quitting. It stays answerable.
  const unanswered = !streaming && !failure && messages.at(-1)?.role === "user";

  const composer = (
    <>
      {sendError ? <p className="text-destructive mb-2 text-sm" role="alert">{sendError}</p> : null}
      <InputGroup size="lg">
        <InputGroupTextarea
          ref={field}
          variant="bare"
          value={input}
          maxLength={LIMITS.messageChars}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter inserts a newline. Not while an input
            // method is composing, where Enter picks a candidate.
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder="Ask anything"
          rows={2}
        />
        <InputGroupAddon align="block-end">
          <Button
            variant="muted"
            size="icon-sm"
            aria-label="Attach files"
            disabled={adding || loading || sending}
            onClick={() => attachInput.current?.click()}
          >
            {adding ? <Spinner /> : <PaperclipIcon />}
          </Button>
          <button
            type="button"
            onClick={onSetUpModel}
            className="text-ink-03 hover:bg-tint-02 hover:text-ink-04 h-7 rounded-full px-2.5 text-xs transition-colors motion-reduce:transition-none"
          >
            {model ? modelLabel(model) : "No model"}
          </button>
          {streaming ? (
            <Button
              size="icon-round"
              aria-label="Stop answering"
              onClick={onCancel}
              className="ml-auto"
            >
              <SquareIcon className="size-3 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon-round"
              aria-label="Send message"
              disabled={loading || adding || sending || input.trim().length === 0}
              onClick={() => void submit()}
              className="ml-auto"
            >
              <ArrowUpIcon />
            </Button>
          )}
        </InputGroupAddon>
      </InputGroup>
    </>
  );

  return (
    <div className="flex h-full min-h-0">
      <input
        ref={attachInput}
        type="file"
        multiple
        hidden
        accept={DOCUMENT_ACCEPT}
        onChange={(event) => {
          if (event.target.files) void addFiles([...event.target.files]);
          event.target.value = "";
        }}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* The one row of chrome a conversation has. It is blank until there is
            a conversation to name: a new session is not called anything yet. */}
        <div
          data-slot="shell-header"
          className="flex h-shell shrink-0 items-center gap-2 border-b pr-2 pl-4"
        >
          <h1 className="text-ink-04 min-w-0 flex-1 truncate text-sm font-medium">
            {chat?.title ?? ""}
          </h1>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={toggleDock}
                  aria-label={dockOpen ? "Close the documents panel" : "Open the documents panel"}
                  aria-pressed={dockOpen}
                  className="text-ink-02 hover:bg-tint-02 hover:text-ink-04 aria-pressed:text-ink-05 relative flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors motion-reduce:transition-none"
                />
              }
            >
              <PanelRightIcon className="size-4.5" />
              {attached.length > 0 && !dockOpen ? (
                <span className="bg-info absolute top-1 right-1 size-1.5 rounded-full" aria-hidden />
              ) : null}
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {attached.length > 0
                ? `Documents (${attached.length})`
                : "Documents"}
            </TooltipContent>
          </Tooltip>
        </div>
        {banner}

        {chat ? (
          <>
            <Conversation className="min-h-0 flex-1">
              <ConversationContent className="mx-auto flex w-full max-w-[46rem] flex-col gap-7 px-6 py-8">
                {messages.map((message) =>
                  message.role === "user" ? (
                    <div key={message.id} className="flex justify-end">
                      <div className="bg-tint-02 max-w-2xl rounded-2xl px-4 py-2.5 text-sm select-text">
                        <p className="whitespace-pre-wrap">{message.text}</p>
                      </div>
                    </div>
                  ) : (
                    <AssistantRow key={message.id}>
                      <StoredAnswer
                        messageId={message.id}
                        text={message.text}
                        sources={message.sources ?? NO_SOURCES}
                        activeIndex={
                          dockOpen && dockTab === "source" && openSource?.messageId === message.id
                            ? openSource.index
                            : null
                        }
                        onSelect={selectSource}
                      />
                    </AssistantRow>
                  ),
                )}

                {streaming ? (
                  streamingText ? (
                    <AssistantRow>
                      <StoredAnswer
                        messageId={STREAMING_ID}
                        text={streamingText}
                        streaming
                        sources={streamingSources}
                        activeIndex={
                          dockOpen && dockTab === "source" && openSource?.messageId === STREAMING_ID
                            ? openSource.index
                            : null
                        }
                        onSelect={selectSource}
                      />
                    </AssistantRow>
                  ) : (
                    <div className="flex gap-3">
                      <OnirixMark className="text-ink-02 mt-0.5 size-5 shrink-0 animate-pulse motion-reduce:animate-none" />
                      <span className="text-ink-03 text-sm">
                        {attached.length > 0 ? "Reading your documents" : "Thinking"}
                      </span>
                    </div>
                  )
                ) : null}

                {failure ? (
                  <Notice
                    tone="error"
                    message={failure.message}
                    action={
                      failure.code === "no-model"
                        ? { label: "Set up a model", onClick: onSetUpModel }
                        : messages.at(-1)?.role === "user"
                          ? { label: "Try again", onClick: onRetry }
                          : null
                    }
                  />
                ) : null}

                {unanswered ? (
                  <Notice
                    tone="quiet"
                    message="This message has no answer yet."
                    action={{ label: "Answer it", onClick: onRetry }}
                  />
                ) : null}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>

          </>
        ) : (
          /* The mark and one line, centred in the free space. The composer
             is not part of this: it sits at the bottom of the column here as
             it does in a conversation, so sending the first message does not
             move the thing the person is typing into. */
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-6 py-10">
            <OnirixMark className="text-ink-04 size-8" />
            <h2 className="tracking-hero text-2xl font-medium">What are you working on?</h2>
          </div>
        )}

        <div className="shrink-0 px-6 pb-4">
          <div className="mx-auto w-full max-w-[46rem]">
            {composer}
            <p className="text-ink-02 mt-2 text-center text-xs">
              {chat
                ? "Models make mistakes. Check what matters."
                : "Chats and documents here stay on this computer."}
            </p>
          </div>
        </div>
      </div>

      <SideDock
        open={dockOpen}
        onOpenChange={setDockOpen}
        tab={dockTab}
        onTabChange={setDockTab}
        documentCount={attached.length}
        panes={{
          documents: (
            <DocumentsPane
              attached={attached}
              library={library}
              adding={adding}
              error={addError}
              onAdd={(files) => void addFiles(files)}
              onAttach={(row) => void attach([row.id])}
              onDetach={(id) => void detach(id)}
              onDelete={(id) => void deleteFromLibrary(id)}
            />
          ),
          source: (
            <SourcePane
              source={activeSource}
              siblings={siblings}
              onSelect={(source) =>
                setOpenSource((current) =>
                  current ? { messageId: current.messageId, index: source.index } : current,
                )
              }
            />
          ),
        }}
      />
    </div>
  );
}

const NO_SOURCES: MessageSource[] = [];

/**
 * One answer, bound to its own id so the callback it hands down is stable:
 * a stream re-renders the conversation many times a second, and an answer
 * above it should not re-parse its markdown each time.
 */
function StoredAnswer({
  messageId,
  text,
  sources,
  activeIndex,
  streaming = false,
  onSelect,
}: {
  messageId: string;
  text: string;
  sources: MessageSource[];
  activeIndex: number | null;
  streaming?: boolean;
  onSelect: (messageId: string, source: MessageSource) => void;
}) {
  const select = useCallback(
    (source: MessageSource) => onSelect(messageId, source),
    [messageId, onSelect],
  );
  return (
    <Answer
      text={text}
      streaming={streaming}
      sources={sources}
      activeIndex={activeIndex}
      onSelectSource={select}
    />
  );
}

function AssistantRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <OnirixMark className="text-ink-04 mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1 text-sm leading-6">{children}</div>
    </div>
  );
}

/** A line the app says in the conversation, in its own voice rather than the model's. */
function Notice({
  tone,
  message,
  action,
}: {
  tone: "error" | "quiet";
  message: string;
  action: { label: string; onClick: () => void } | null;
}) {
  return (
    <div className="flex gap-3" role={tone === "error" ? "alert" : undefined}>
      <OnirixMark className="text-ink-02 mt-2.5 size-5 shrink-0" />
      <div
        className={
          tone === "error"
            ? "bg-danger-subtle flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-2.5"
            : "bg-tint-01 flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-2.5"
        }
      >
        <p
          className={
            tone === "error"
              ? "text-destructive min-w-0 flex-1 text-sm select-text"
              : "text-ink-03 min-w-0 flex-1 text-sm"
          }
        >
          {message}
        </p>
        {action ? (
          <Button
            size="sm"
            variant={tone === "error" ? "default" : "outline"}
            className="rounded-full px-3"
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
