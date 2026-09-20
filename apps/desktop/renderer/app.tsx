/**
 * The app with no server: a sidebar of local chats, a conversation, settings,
 * and the first-run setup over all of it.
 *
 * State that outlives a view lives here. An answer keeps arriving while the
 * person reads another chat or opens Settings, so what has streamed so far is
 * kept by chat id at this level, not inside the conversation component.
 */
import { XIcon } from "@onirix/ui/lib/icons";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@onirix/ui/components/button";
import { SidebarInset, SidebarProvider } from "@onirix/ui/components/sidebar";
import { Spinner } from "@onirix/ui/components/spinner";

import type {
  Appearance,
  Chat,
  ChatFailure,
  ChatSummary,
  LibraryDocument,
  LocalState,
  MessageSource,
  ModelChoice,
  SendResult,
  ShellIntent,
} from "../src/local-bridge";

import { errorMessage, getBridge } from "./bridge";
import { ChatView } from "./chat-view";
import { Modal, ModalDescription, ModalTitle } from "./modal";
import { OnboardingDialog, type OnboardingStart } from "./onboarding/onboarding-dialog";
import { ServerForm } from "./server-form";
import type { SettingsPage } from "./settings-nav";
import { SettingsView } from "./settings-view";
import { ShellControls } from "./shell-controls";
import { LocalSidebar } from "./sidebar";

type View = { kind: "chat"; chatId: string | null } | { kind: "settings"; page: SettingsPage };

function sameView(a: View, b: View): boolean {
  if (a.kind === "settings") return b.kind === "settings" && a.page === b.page;
  return b.kind === "chat" && a.chatId === b.chatId;
}

/**
 * Where the person has been, for the back and forward arrows. The window has
 * no URLs, so this is the renderer's own short history: going somewhere new
 * drops whatever was ahead, exactly as a browser does.
 */
type Trail = { views: View[]; at: number };

const HOME: View = { kind: "chat", chatId: null };

export function App() {
  const bridge = getBridge();

  const [state, setState] = useState<LocalState | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [trail, setTrail] = useState<Trail>({ views: [HOME], at: 0 });
  const view = trail.views[trail.at] ?? HOME;
  const viewRef = useRef(view);
  viewRef.current = view;
  const [chat, setChat] = useState<Chat | null>(null);
  const [library, setLibrary] = useState<LibraryDocument[]>([]);
  /** The passages given to each answer still arriving. */
  const [streamSources, setStreamSources] = useState<Record<string, MessageSource[]>>({});
  /** A saved server that did not answer at launch. Null once dismissed. */
  const [unreachable, setUnreachable] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [serverFormOpen, setServerFormOpen] = useState(false);
  /** The answer so far, for every chat that has one arriving. */
  const [streams, setStreams] = useState<Record<string, string>>({});
  const [failures, setFailures] = useState<Record<string, ChatFailure>>({});
  /** `run` counts openings: it keys the dialog, so each one starts fresh. */
  const [onboarding, setOnboarding] = useState<{
    open: boolean;
    start: OnboardingStart;
    run: number;
  }>({ open: false, start: "welcome", run: 0 });

  const activeChatId = view.kind === "chat" ? view.chatId : null;
  // Events arrive outside React's render cycle and need the current value.
  const activeRef = useRef(activeChatId);
  activeRef.current = activeChatId;

  const refreshChats = useCallback(async () => {
    setChats(await bridge.chats.list());
  }, [bridge]);

  const refreshLibrary = useCallback(async () => {
    setLibrary(await bridge.documents.list());
  }, [bridge]);

  const navigate = useCallback((next: View) => {
    setTrail((current) => {
      const here = current.views[current.at];
      if (here && sameView(here, next)) return current;
      const views = [...current.views.slice(0, current.at + 1), next].slice(-50);
      return { views, at: views.length - 1 };
    });
  }, []);

  /**
   * Swaps the current entry instead of adding one. A new session that becomes
   * a chat is the same place with a name now, and Back from it should not land
   * on the empty page it grew out of.
   */
  const replaceView = useCallback((next: View) => {
    setTrail((current) => ({
      ...current,
      views: current.views.map((entry, index) => (index === current.at ? next : entry)),
    }));
  }, []);

  const step = useCallback((by: -1 | 1) => {
    setTrail((current) => {
      const at = current.at + by;
      return at < 0 || at >= current.views.length ? current : { ...current, at };
    });
  }, []);

  const openOnboarding = useCallback((start: OnboardingStart) => {
    setOnboarding((current) => ({ open: true, start, run: current.run + 1 }));
  }, []);

  const applyIntent = useCallback((intent: ShellIntent) => {
    if (intent.type === "unreachable") setUnreachable(intent.origin);
    else setServerFormOpen(true);
  }, []);

  useEffect(() => {
    void (async () => {
      const loaded = await bridge.state();
      setState(loaded);
      // First launch: the app is already there behind it, and usable.
      if (!loaded.onboardingCompleted) openOnboarding("welcome");
      if (loaded.intent) applyIntent(loaded.intent);
    })();
    void refreshChats();
    void refreshLibrary();
  }, [bridge, refreshChats, refreshLibrary, applyIntent, openOnboarding]);

  useEffect(() => bridge.shell.onIntent(applyIntent), [bridge, applyIntent]);

  // The sidebar can be closed, and on macOS the corner then holds the arrows
  // rather than "New session", so starting one also has a key. Settings has
  // the key every desktop app gives it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== "n" && key !== ",") return;
      event.preventDefault();
      navigate(key === "n" ? HOME : { kind: "settings", page: "general" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  useEffect(
    () =>
      bridge.chats.onEvent((event) => {
        if (event.type === "sources") {
          setStreamSources((current) => ({ ...current, [event.chatId]: event.sources }));
          return;
        }
        if (event.type === "delta") {
          setStreams((current) => ({
            ...current,
            [event.chatId]: (current[event.chatId] ?? "") + event.text,
          }));
          return;
        }
        setStreams(({ [event.chatId]: _ended, ...rest }) => rest);
        setStreamSources(({ [event.chatId]: _stored, ...rest }) => rest);
        if (event.type === "failed") {
          setFailures((current) => ({ ...current, [event.chatId]: event.failure }));
        }
        if (activeRef.current === event.chatId) setChat(event.chat);
        void refreshChats();
      }),
    [bridge, refreshChats],
  );

  // Load the conversation when the page changes to one that is not loaded.
  useEffect(() => {
    if (activeChatId === null) {
      setChat(null);
      return;
    }
    if (chat?.id === activeChatId) return;
    let stale = false;
    void bridge.chats.get(activeChatId).then((loaded) => {
      if (stale) return;
      if (loaded) setChat(loaded);
      // Deleted underneath us, or the file was damaged: back to a new session.
      else replaceView(HOME);
    });
    return () => {
      stale = true;
    };
  }, [activeChatId, bridge, chat?.id, replaceView]);

  function clearFailure(chatId: string) {
    setFailures(({ [chatId]: _cleared, ...rest }) => rest);
  }

  function applySendResult(result: SendResult, origin: View) {
    const { id } = result.chat;
    // An IPC reply must not take the reader back after they navigate away.
    if (sameView(viewRef.current, origin)) {
      setChat(result.chat);
      if (origin.kind === "chat" && origin.chatId === null) {
        replaceView({ kind: "chat", chatId: id });
      }
    }
    if (result.streaming) setStreams((current) => ({ ...current, [id]: current[id] ?? "" }));
    if (result.failure) {
      const { failure } = result;
      setFailures((current) => ({ ...current, [id]: failure }));
    }
    void refreshChats();
  }

  async function run(chatId: string | null, call: () => Promise<SendResult>) {
    const origin = viewRef.current;
    if (chatId) clearFailure(chatId);
    try {
      applySendResult(await call(), origin);
      return true;
    } catch (failure) {
      if (chatId) {
        const message = errorMessage(failure);
        setFailures((current) => ({ ...current, [chatId]: { code: "failed", message } }));
        return false;
      }
      throw failure;
    }
  }

  function setModel(model: ModelChoice | null) {
    setState((current) => (current ? { ...current, model } : current));
    // "No language model is set up" stops being true the moment one is. The
    // question it was said about stays, with a plain offer to answer it.
    if (model) {
      setFailures((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([, failure]) => failure.code !== "no-model"),
        ),
      );
    }
  }

  function setAppearance(appearance: Appearance) {
    setState((current) => (current ? { ...current, appearance } : current));
    void bridge.appearance.set(appearance);
  }

  function closeOnboarding() {
    setOnboarding((current) => ({ ...current, open: false }));
    setState((current) => (current ? { ...current, onboardingCompleted: true } : current));
    void bridge.onboarding.complete();
  }

  async function renameChat(id: string, title: string) {
    const renamed = await bridge.chats.rename(id, title);
    setChat((current) => (current?.id === id ? { ...current, title: renamed.title } : current));
    void refreshChats();
  }

  async function deleteChat(id: string) {
    await bridge.chats.remove(id);
    clearFailure(id);
    // Out of the history too, so Back never lands on a chat that is gone.
    setTrail((current) => {
      const views = current.views.map((entry) =>
        entry.kind === "chat" && entry.chatId === id ? HOME : entry,
      );
      return { ...current, views };
    });
    void refreshChats();
  }

  /**
   * Out of Settings, to wherever the person was before they went in. Walking
   * the trail backwards finds it; a new entry is added rather than the trail
   * rewound, so Back afterwards returns to the settings page just left.
   */
  function backToApp() {
    const before = trail.views.slice(0, trail.at).reverse();
    navigate(before.find((entry) => entry.kind === "chat") ?? HOME);
  }

  async function retryServer() {
    setRetrying(true);
    try {
      // On success the shell replaces this window, so there is nothing to do.
      await bridge.server.retry();
    } catch {
      // Still down. The notice already says so; it stays where it is.
      setRetrying(false);
    }
  }

  // Nothing to draw until the shell has said who we are. It answers from
  // memory, so this is a frame or two, not a loading screen.
  if (!state) return null;

  const mac = state.platform === "darwin";

  // Under each view's header row rather than above it: that row is the
  // window's title bar on macOS, with the traffic lights and the arrows on it,
  // and a notice pushed in above would slide them out of line.
  const banner = unreachable ? (
    <div
      role="status"
      className="bg-warning-subtle flex shrink-0 items-center gap-3 border-b py-2 pr-2 pl-4 text-sm"
      data-slot="server-notice"
    >
      <p className="min-w-0 flex-1 truncate select-text">
        Could not reach {unreachable}. You are working on this computer for now.
      </p>
      <Button
        size="sm"
        variant="outline"
        className="rounded-full px-3"
        disabled={retrying}
        onClick={() => void retryServer()}
      >
        {retrying ? <Spinner /> : null}
        {retrying ? "Trying" : "Try again"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="rounded-full px-3"
        onClick={() => setServerFormOpen(true)}
      >
        Change server
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Dismiss"
        onClick={() => setUnreachable(null)}
      >
        <XIcon />
      </Button>
    </div>
  ) : null;

  return (
    // No cookie: the page is not served over http, and has nowhere to keep one.
    <SidebarProvider cookieName={false} className="h-full min-h-0">
      <LocalSidebar
        mac={mac}
        chats={chats}
        activeChatId={activeChatId}
        settingsPage={view.kind === "settings" ? view.page : null}
        onNewSession={() => navigate(HOME)}
        onOpenChat={(id) => navigate({ kind: "chat", chatId: id })}
        onOpenSettings={(page) => navigate({ kind: "settings", page })}
        onBackToApp={backToApp}
        onRename={(id, title) => void renameChat(id, title)}
        onDelete={(id) => void deleteChat(id)}
      />
      <SidebarInset className="h-full min-h-0 min-w-0">
        {view.kind === "settings" ? (
          <SettingsView
            page={view.page}
            banner={banner}
            state={state}
            library={library}
            onLibraryChange={refreshLibrary}
            onModelChange={setModel}
            onAppearanceChange={setAppearance}
            onChangeModel={() => openOnboarding("choice")}
            onReplaySetup={() => openOnboarding("welcome")}
          />
        ) : (
          <ChatView
            banner={banner}
            chatId={activeChatId}
            chat={activeChatId && chat?.id === activeChatId ? chat : null}
            streamingText={activeChatId ? streams[activeChatId] : undefined}
            streamingSources={(activeChatId ? streamSources[activeChatId] : undefined) ?? []}
            failure={activeChatId ? (failures[activeChatId] ?? null) : null}
            model={state.model}
            library={library}
            onLibraryChange={refreshLibrary}
            onChatChange={(updated) => {
              if (activeRef.current === updated.id) setChat(updated);
            }}
            onSend={(text, documentIds) =>
              run(activeChatId, () => bridge.chats.send(activeChatId, text, documentIds))
            }
            onRetry={() => {
              if (activeChatId) void run(activeChatId, () => bridge.chats.retry(activeChatId));
            }}
            onCancel={() => {
              if (activeChatId) void bridge.chats.cancel(activeChatId);
            }}
            onSetUpModel={() => openOnboarding("choice")}
          />
        )}
      </SidebarInset>

      {/* After the content on purpose, though they are fixed in the corner and
          it makes no difference to where they appear. The window's draggable
          area is built by walking the page in document order, each drag
          region adding its box and each `no-drag` one taking its box away. Put
          ahead of the page, these buttons are taken away first and then the
          page's header row, a drag region, is added straight back over them:
          with the sidebar shut they sit on that row, look fine, and never
          receive a click. */}
      <ShellControls
        mac={mac}
        canGoBack={trail.at > 0}
        canGoForward={trail.at < trail.views.length - 1}
        onBack={() => step(-1)}
        onForward={() => step(1)}
        onNewSession={() => navigate(HOME)}
      />

      <Modal open={serverFormOpen} onOpenChange={setServerFormOpen} className="w-[480px] gap-5 p-6">
        <div className="flex flex-col gap-1.5">
          <ModalTitle className="text-base font-semibold">Connect to a server</ModalTitle>
          <ModalDescription className="text-ink-03">
            An Onirix server adds shared company knowledge, connectors, teams and database sources.
          </ModalDescription>
        </div>
        {serverFormOpen ? (
          <ServerForm defaultAddress={state.suggestedServer} />
        ) : null}
      </Modal>

      <OnboardingDialog
        key={onboarding.run}
        open={onboarding.open}
        start={onboarding.start}
        state={state}
        onModelChange={setModel}
        onClose={closeOnboarding}
      />
    </SidebarProvider>
  );
}
