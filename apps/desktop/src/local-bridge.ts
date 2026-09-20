/**
 * The contract between the local renderer and the shell.
 *
 * With no server attached the app still has to be useful, so the shell serves
 * a small UI of its own (see `renderer/`) and does for it what a server would:
 * keeps the chats, holds the model credentials, and makes the model calls.
 * The renderer has no network access at all. Everything it can do is on this
 * page.
 *
 * Like `dashboard/src/lib/desktop.ts`, this file is types and constants only,
 * so the preload, the main process, and the renderer can all compile it.
 */
import type {
  DesktopPlatform,
  LocalModel,
  LocalProgress,
  LocalRuntimeStatus,
} from "../../dashboard/src/lib/desktop";

export type { DesktopPlatform, LocalModel, LocalProgress, LocalRuntimeStatus };

/** Providers reached with a key. Ollama is the other path, not one of these. */
export const API_PROVIDER_IDS = ["openai", "anthropic", "google", "xai"] as const;
export type ApiProviderId = (typeof API_PROVIDER_IDS)[number];

/**
 * What answers in local mode, as the renderer is allowed to know it.
 *
 * The key itself never comes back across the bridge once saved. The renderer
 * learns that one exists, which is all it needs to draw the settings page.
 */
export type ModelChoice =
  | { kind: "local"; model: string }
  | { kind: "api"; provider: ApiProviderId; model: string; hasKey: true };

export type Appearance = "system" | "light" | "dark";

/** Whether answers may read the web, and where (see web-access.ts). */
export type WebAccess = {
  enabled: boolean;
  /** Hosts such as `example.com`, subdomains included. Empty means any website. */
  sites: string[];
};

/**
 * One passage an answer was given to read, kept with the answer.
 *
 * Stored rather than looked up again later: a document can be removed from
 * the library, and an answer that cites it should still be able to show what
 * it was citing.
 */
export type MessageSource = {
  /** 1-based number the model writes inline, 1 for `[1]`. */
  index: number;
  documentId: string;
  title: string;
  /** The retrieved chunk: what the answer was actually grounded in. */
  passage: string;
  /** Where in the document it sits ("Page 3", a sheet name), when known. */
  location: string | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  /** On an answer that was given passages to read, cited or not. */
  sources?: MessageSource[];
};

/**
 * A file in the local library. Added once, it can be attached to any session,
 * which is how a contract read on Monday is still there to ask about on Friday
 * without being found and dropped in again.
 */
export type LibraryDocument = {
  id: string;
  title: string;
  mimeType: string;
  sizeBytes: number;
  addedAt: string;
  /** `processing` while the text is being read out of the file. */
  status: "processing" | "indexed" | "failed";
  chunkCount: number;
  /** Why reading failed, as a sentence, when it did. */
  error: string | null;
};

/**
 * An instruction the local answers follow (see local-skills.ts). Every enabled
 * one is in every prompt: there is no loading on demand without tools.
 */
export type LocalSkill = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
  /** Shipped with the app rather than written here: resettable, not deletable. */
  builtIn: boolean;
};

/** The editable half of a skill. A built-in ignores `name`. */
export type SkillDraft = Omit<LocalSkill, "id" | "builtIn">;

export type ChatSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

export type Chat = ChatSummary & {
  createdAt: string;
  messages: ChatMessage[];
  /** Library documents this session reads. Answers search these and only these. */
  documentIds: string[];
};

/**
 * Why a message got no answer. `no-model` is its own case because the fix is
 * a different one: not "try again" but "set up a model".
 */
export type ChatFailure = { code: "no-model" | "failed"; message: string };

/** What `send` and `retry` answer with, before any of the answer exists. */
export type SendResult = {
  /** The chat as stored, with the new message in it. */
  chat: Chat;
  /** True when an answer is on its way as `ChatStreamEvent`s. */
  streaming: boolean;
  failure: ChatFailure | null;
};

export type ChatStreamEvent =
  /** Sent before the first word, so `[1]` is a working chip while it streams. */
  | { type: "sources"; chatId: string; sources: MessageSource[] }
  | { type: "delta"; chatId: string; text: string }
  | { type: "done"; chatId: string; chat: Chat }
  | { type: "failed"; chatId: string; failure: ChatFailure; chat: Chat };

export type LocalState = {
  platform: DesktopPlatform;
  version: string;
  onboardingCompleted: boolean;
  appearance: Appearance;
  model: ModelChoice | null;
  webAccess: WebAccess;
  /** What the server address field starts with: the last one used, or the build's default. */
  suggestedServer: string;
  /**
   * Why the window opened the way it did, when that needs saying. Handed over
   * once: reading the state clears it, so a reload does not repeat it.
   */
  intent: ShellIntent | null;
};

/**
 * What the shell asks of the window. `unreachable` is a saved server that did
 * not answer: the app opens anyway, and says so. `change-server` is the menu
 * item, which opens the server form.
 */
export type ShellIntent =
  | { type: "unreachable"; origin: string }
  | { type: "change-server" };

export type LocalBridge = {
  state: () => Promise<LocalState>;
  onboarding: {
    /** Finished, skipped, or closed: all three are recorded the same way. */
    complete: () => Promise<void>;
  };
  appearance: {
    set: (appearance: Appearance) => Promise<void>;
  };
  webAccess: {
    /** Answers with what was stored: addresses come back as bare hosts. */
    set: (webAccess: WebAccess) => Promise<WebAccess>;
  };
  model: {
    useLocal: (model: string) => Promise<ModelChoice>;
    /** Makes one small request with the key, and saves only if it answers. */
    useApiKey: (input: {
      provider: ApiProviderId;
      model: string;
      apiKey: string;
    }) => Promise<ModelChoice>;
    /** Changes the model for the saved key, which the renderer cannot resend. */
    changeApiModel: (model: string) => Promise<ModelChoice>;
    clear: () => Promise<void>;
  };
  chats: {
    list: () => Promise<ChatSummary[]>;
    get: (id: string) => Promise<Chat | null>;
    rename: (id: string, title: string) => Promise<ChatSummary>;
    remove: (id: string) => Promise<void>;
    /**
     * `chatId` null starts a new chat, with `documentIds` attached to it: a
     * chat is only written when its first message is sent, so documents picked
     * before then arrive with that message.
     */
    send: (chatId: string | null, text: string, documentIds?: string[]) => Promise<SendResult>;
    attach: (chatId: string, documentIds: string[]) => Promise<Chat>;
    detach: (chatId: string, documentId: string) => Promise<Chat>;
    /** Answers the last message again, after a failure or a cancel. */
    retry: (chatId: string) => Promise<SendResult>;
    cancel: (chatId: string) => Promise<void>;
    onEvent: (listener: (event: ChatStreamEvent) => void) => () => void;
  };
  documents: {
    list: () => Promise<LibraryDocument[]>;
    /**
     * Copies files into the library and reads their text. Takes the `File`
     * objects of a drop or a file picker, never a path: the preload asks
     * Electron where each one lives, so the page cannot name a file the person
     * did not hand it.
     */
    add: (files: File[]) => Promise<AddDocumentsResult>;
    /** Deletes the library's copy and its index. The original is untouched. */
    remove: (id: string) => Promise<void>;
    /** Where the library lives and how much room it takes, for Settings. */
    storage: () => Promise<{ path: string; totalBytes: number }>;
  };
  skills: {
    list: () => Promise<LocalSkill[]>;
    create: (draft: SkillDraft) => Promise<LocalSkill>;
    update: (id: string, draft: SkillDraft) => Promise<LocalSkill>;
    /** Puts a built-in back the way it shipped. */
    reset: (id: string) => Promise<LocalSkill>;
    remove: (id: string) => Promise<void>;
  };
  app: {
    /** Shows the folder holding chats, documents and settings in the file manager. */
    openDataFolder: () => Promise<void>;
    /** The same check as the menu item. It answers with a native dialog. */
    checkForUpdates: () => Promise<void>;
  };
  server: {
    /** Resolves as the window is replaced by the server's workspace. */
    connect: (address: string) => Promise<void>;
    /** Tries the saved server again. Rejects with a sentence if it is still down. */
    retry: () => Promise<void>;
  };
  shell: {
    /** The shell asking for something while the window is already open. */
    onIntent: (listener: (intent: ShellIntent) => void) => () => void;
  };
  runtime: {
    status: () => Promise<LocalRuntimeStatus>;
    install: () => Promise<LocalRuntimeStatus>;
    start: () => Promise<LocalRuntimeStatus>;
    models: () => Promise<LocalModel[]>;
    pull: (model: string) => Promise<void>;
    cancel: (model: string) => Promise<void>;
    remove: (model: string) => Promise<void>;
    onProgress: (listener: (progress: LocalProgress) => void) => () => void;
  };
};

/**
 * One drop can hold files that are welcome and files that are not. The good
 * ones are added regardless, and each refusal comes back as its own sentence.
 */
export type AddDocumentsResult = { documents: LibraryDocument[]; refused: string[] };

/** Limits both sides agree on; the main process enforces them. */
export const LIMITS = {
  messageChars: 32_000,
  titleChars: 120,
  apiKeyChars: 512,
  addressChars: 2048,
  /** Per file. Past this, reading a document stops being a matter of seconds. */
  documentBytes: 50 * 1024 * 1024,
  /** Files in one drop, and documents attached to one session. */
  documentsPerCall: 20,
  documentsPerChat: 50,
  /** The server's limits for a skill, so one written here fits there. */
  skillNameChars: 64,
  skillDescriptionChars: 200,
  skillInstructionsChars: 20_000,
  /** Every enabled skill is in every prompt, so the list has an end. */
  skills: 50,
  /** The most a provider's search takes as a domain filter. */
  webSites: 100,
} as const;

declare global {
  interface Window {
    onirixLocal?: LocalBridge;
  }
}
