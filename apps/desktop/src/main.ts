/**
 * The Onirix desktop shell.
 *
 * The app opens into something usable with no server at all: a local window
 * (see `renderer/`) that chats with a model on this computer or one reached
 * with the person's own key, and keeps those chats on this disk. Attached to
 * an Onirix server it is a thin client instead: the window shows the web app
 * that server serves, exactly as a browser tab would, so sign-in, permissions,
 * and data all stay on the server. Either way the shell adds what a tab cannot
 * have: a native window, and a local model runtime.
 *
 * Two windows exist, never both at once. The local window is the app with no
 * server. The workspace window is a server. There is no screen in between: a
 * saved server that cannot be reached opens the local window with a notice
 * saying so, and changing server is a form inside the local window, so the
 * person is never parked on a page that can do nothing but ask for an address.
 */
import {
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
  app,
  ipcMain,
  nativeTheme,
  protocol,
  shell,
} from "electron";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

import { PROVIDERS } from "@onirix/llm/catalog";

import type { LocalProgress } from "../../dashboard/src/lib/desktop";

import {
  type AddDocumentsResult,
  type Appearance,
  type ChatStreamEvent,
  LIMITS,
  type LocalState,
  type ShellIntent,
} from "./local-bridge";
import * as localChat from "./local-chat";
import * as localDocuments from "./local-documents";
import * as localModel from "./local-model";
import * as localStore from "./local-store";
import * as runtime from "./runtime";
import { readSettings, writeSettings } from "./settings";
import { RELEASES_PAGE, checkForUpdates, watchForUpdates } from "./updates";

const DEFAULT_SERVER = process.env.ONIRIX_DEFAULT_SERVER ?? "http://localhost:3001";
const isMac = process.platform === "darwin";

/**
 * Hosts the workspace window may navigate to and come back from.
 *
 * Signing in with Google no longer happens here: Google refuses OAuth to
 * embedded browsers, so the web app hands that off to the real browser
 * through `server:openInBrowser`. What still starts in this window is linking
 * a Google account to an existing session, for the Drive connector.
 */
const SIGN_IN_HOSTS = /(^|\.)(google\.com|youtube\.com|googleusercontent\.com)$/;

/**
 * The scheme the browser uses to hand the user back.
 *
 * A sign-in that had to happen in the browser ends on a page there, with the
 * app behind every other window. That page then opens `onirix://`, which the
 * OS routes here. The link carries nothing: the window that started the
 * sign-in is already waiting for its session, so all this has to do is come
 * to the front.
 */
const PROTOCOL = "onirix";

/**
 * Where the local renderer is served from.
 *
 * A scheme of the shell's own rather than `file://`: every file URL shares one
 * origin with every other file on the disk, which is no basis for deciding who
 * may call the bridge. This gives the renderer a stable origin that nothing
 * else can have, and a handler that serves one directory and nothing above it.
 */
const LOCAL_SCHEME = "onirix-app";
const LOCAL_HOST = "local";
/** Must match `LOCAL_ORIGIN` in local-preload.ts. */
const LOCAL_ORIGIN = `${LOCAL_SCHEME}://${LOCAL_HOST}`;

/**
 * The renderer's whole allowance. No network (`connect-src 'none'`): model
 * calls are made by this process, so a page that was somehow talked into
 * running hostile markup still has nowhere to send a chat. Also set in the
 * page's own meta tag; the header is the copy the page cannot remove.
 */
const LOCAL_CSP =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; script-src 'self'";

// Has to happen before the app is ready. `standard` gives the scheme real
// origins and relative URLs, `secure` makes it a secure context like https.
protocol.registerSchemesAsPrivileged([
  {
    scheme: LOCAL_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

let workspace: BrowserWindow | null = null;
let local: BrowserWindow | null = null;

/**
 * Something the local window should say or open, waiting for a window to say
 * it in. Handed over with `local:state` when the window is new, or pushed as
 * an event when it is already up. Either way it is delivered once.
 */
let pendingIntent: ShellIntent | null = null;

/** Origin of the attached server; IPC from any other origin is refused. */
let serverOrigin: string | null = null;

// Sites that sniff for an embedded browser see a plain Chromium. This is not
// enough for Google, which blocks OAuth from an app window however it
// introduces itself; that is why sign-in hands off to the real browser.
app.userAgentFallback = app.userAgentFallback
  .replace(/ Electron\/\S+/, "")
  .replace(new RegExp(` ${app.getName()}/\\S+`, "i"), "");

function background(): string {
  return nativeTheme.shouldUseDarkColors ? "#000000" : "#ffffff";
}

/**
 * The origins an entered address could mean, most likely first.
 *
 * People type `onirix.acme.com` and `localhost:3001` without a scheme. A bare
 * name is tried over https and then http, so a self-hosted box on a LAN works
 * without the user having to know which one it serves.
 */
function candidateOrigins(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter the address of your Onirix server.");
  const spelled = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const origins = (spelled ? [trimmed] : [`https://${trimmed}`, `http://${trimmed}`]).map(
    (candidate) => {
      let url: URL;
      try {
        url = new URL(candidate);
      } catch {
        throw new Error("That does not look like a server address.");
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Use an http or https address.");
      }
      return url.origin;
    },
  );
  return origins;
}

/**
 * Confirms an address is an Onirix server before the app commits to it, so a
 * typo lands as a sentence under the address field rather than a blank window.
 */
async function probeServer(origin: string, timeoutMs = 8000): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new Error(`Could not reach ${origin}. Check the address and that the server is running.`);
  }
  const body = (await response.json().catch(() => null)) as { checks?: unknown } | null;
  if (!body || typeof body.checks !== "object") {
    throw new Error(`${origin} answered, but it is not an Onirix server.`);
  }
}

async function firstReachable(origins: string[]): Promise<string> {
  let failure: unknown;
  for (const origin of origins) {
    try {
      await probeServer(origin);
      return origin;
    } catch (error) {
      failure ??= error;
    }
  }
  throw failure;
}

const APPEARANCES: readonly Appearance[] = ["system", "light", "dark"];

/**
 * The local window follows the appearance chosen in its settings, by way of
 * `nativeTheme`: that is what `prefers-color-scheme` reports to the page, and
 * it themes the native parts (menus, the window frame) to match. A server
 * workspace has a theme setting of its own, so there it goes back to system.
 */
function applyAppearance(mode: "local" | "server"): void {
  const { appearance } = readSettings();
  nativeTheme.themeSource =
    mode === "local" && APPEARANCES.includes(appearance) ? appearance : "system";
}

function openWorkspace(origin: string): void {
  serverOrigin = origin;
  applyAppearance("server");
  const { bounds } = readSettings();

  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: background(),
    // The web app draws its own chrome: the sidebar runs to the top of the
    // window and the traffic lights sit inside it.
    titleBarStyle: isMac ? "hiddenInset" : "default",
    trafficLightPosition: { x: 16, y: 16 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      additionalArguments: [`--onirix-server=${origin}`, `--onirix-version=${app.getVersion()}`],
    },
  });
  workspace = window;

  window.once("ready-to-show", () => window.show());
  window.on("close", () => writeSettings({ bounds: window.getNormalBounds() }));
  window.on("closed", () => {
    if (workspace === window) workspace = null;
  });

  const contents = window.webContents;

  // Links out of the product open in the browser. A same-origin popup (an
  // original file, a print view) stays in the app, with the same sandbox.
  contents.setWindowOpenHandler(({ url }) => {
    if (sameOrigin(url, origin)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
        },
      };
    }
    openExternal(url);
    return { action: "deny" };
  });

  contents.on("will-navigate", (event, url) => {
    if (sameOrigin(url, origin) || isSignInHost(url)) return;
    event.preventDefault();
    openExternal(url);
  });

  contents.on("did-fail-load", (_event, code, _description, url, isMainFrame) => {
    // -3 is an aborted load (a redirect, a second click), not a failure.
    if (!isMainFrame || code === -3) return;
    if (!sameOrigin(url, origin)) return;
    // The server went away, or never came up. The app stays usable, and the
    // address stays saved: a server that is down today is tried again on the
    // next launch.
    openLocal({ type: "unreachable", origin });
  });

  // The public site is for visitors; the app opens on the product, which
  // sends anyone without a session to sign in.
  void window.loadURL(`${origin}/chat`);
}

/**
 * The app with no server: the renderer the shell ships, in the same window
 * chrome as a workspace so moving between the two does not feel like changing
 * apps.
 */
function openLocal(intent: ShellIntent | null = null): void {
  // The reference is dropped before the window is closed: its `closed`
  // handler only clears a window that is still the current one.
  const leaving = workspace;
  workspace = null;
  serverOrigin = null;

  if (local) {
    leaving?.close();
    if (local.isMinimized()) local.restore();
    local.focus();
    if (intent) send(local, "local:shell:intent", intent);
    return;
  }
  pendingIntent = intent;

  applyAppearance("local");
  const { bounds } = readSettings();

  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: background(),
    // As in a workspace: the sidebar runs to the top of the window and the
    // traffic lights sit inside it.
    titleBarStyle: isMac ? "hiddenInset" : "default",
    trafficLightPosition: { x: 16, y: 16 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "local-preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  local = window;

  window.once("ready-to-show", () => window.show());
  window.on("close", () => writeSettings({ bounds: window.getNormalBounds() }));
  window.on("closed", () => {
    if (local !== window) return;
    local = null;
    // Nobody is reading the answers any more, and they cost the person money
    // or battery. What has arrived so far is kept (see local-chat.ts).
    localChat.cancelAll();
  });

  const contents = window.webContents;

  // This window shows one page and goes nowhere else. A link in an answer
  // opens in the browser; anything else is refused.
  contents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (isLocalUrl(url)) return;
    event.preventDefault();
    openExternal(url);
  });

  void window.loadURL(`${LOCAL_ORIGIN}/index.html`);
  // After the new window exists, so there is never a moment with none: on
  // Windows and Linux that moment would quit the app.
  leaving?.close();
}

/**
 * Attaches to a server the person just named, or asked to try again.
 * Rejects with a sentence when it does not answer; the local window shows it.
 */
async function attach(address: string): Promise<void> {
  const origin = await firstReachable(candidateOrigins(address));
  writeSettings({
    serverUrl: origin,
    lastServerUrl: origin,
    onboardingCompletedAt: readSettings().onboardingCompletedAt ?? new Date().toISOString(),
  });
  const leaving = local;
  openWorkspace(origin);
  leaving?.close();
}

/**
 * Leaves the server for local mode, and stays there on the next launch. The
 * address is remembered so going back does not mean typing it again.
 */
function useWithoutServer(): void {
  const { serverUrl, lastServerUrl } = readSettings();
  writeSettings({ serverUrl: null, lastServerUrl: serverUrl ?? lastServerUrl });
  openLocal();
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

/**
 * Serves `dist/renderer`, and only that.
 *
 * The check that matters is the last one: whatever the URL said, however it
 * was encoded, the path it resolves to must still be inside the renderer
 * directory. Everything before it is just declining early.
 */
function registerLocalProtocol(): void {
  const root = join(__dirname, "renderer");
  const refuse = (status: number) => new Response(null, { status });

  protocol.handle(LOCAL_SCHEME, async (request) => {
    if (request.method !== "GET") return refuse(405);

    let pathname: string;
    try {
      const url = new URL(request.url);
      if (url.host !== LOCAL_HOST) return refuse(404);
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return refuse(400);
    }
    if (pathname.includes("\0")) return refuse(400);
    if (pathname === "/") pathname = "/index.html";

    const file = resolve(root, `.${pathname}`);
    if (!file.startsWith(root + sep)) return refuse(403);
    const type = MIME_TYPES[extname(file).toLowerCase()];
    if (!type) return refuse(404);

    try {
      return new Response(new Uint8Array(await readFile(file)), {
        headers: {
          "content-type": type,
          "content-security-policy": LOCAL_CSP,
          "x-content-type-options": "nosniff",
          // The files change with every build and are read from the disk;
          // there is nothing for a cache to save.
          "cache-control": "no-store",
        },
      });
    } catch {
      return refuse(404);
    }
  });
}

/**
 * Whether a URL is the local renderer's. Compared by parts: Node does not know
 * the scheme is a standard one, so its `URL.origin` is the string "null".
 */
function isLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === `${LOCAL_SCHEME}:` && parsed.host === LOCAL_HOST;
  } catch {
    return false;
  }
}

function sameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function isSignInHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && SIGN_IN_HOSTS.test(parsed.hostname);
  } catch {
    return false;
  }
}

function openExternal(url: string): void {
  try {
    const { protocol } = new URL(url);
    if (protocol === "https:" || protocol === "http:" || protocol === "mailto:") {
      void shell.openExternal(url);
    }
  } catch {
    // Not a URL; nothing to open.
  }
}

/** Who a channel answers: the attached server's page, the local renderer, or both. */
type Caller = "server" | "local" | "either";

/**
 * Calls are honoured only from the top frame of a page the shell put there:
 * the attached server's origin in the workspace window, or the local renderer
 * in the local window. The preloads already withhold the bridges everywhere
 * else; this is the check that does not depend on the page being honest.
 *
 * Each channel names who may call it. The server's page has no business with
 * local chats or the saved key, and the local renderer has none with the
 * server's sign-in, so neither is answered on the other's channels.
 */
function assertTrusted(event: Electron.IpcMainInvokeEvent, caller: Caller): void {
  const frame = event.senderFrame;
  const fromServer =
    frame !== null &&
    workspace !== null &&
    event.sender === workspace.webContents &&
    frame === workspace.webContents.mainFrame &&
    serverOrigin !== null &&
    sameOrigin(frame.url, serverOrigin);
  const fromLocal =
    frame !== null &&
    local !== null &&
    event.sender === local.webContents &&
    frame === local.webContents.mainFrame &&
    isLocalUrl(frame.url);
  const trusted =
    (caller !== "local" && fromServer) || (caller !== "server" && fromLocal);
  if (!trusted) throw new Error("Not allowed from this page.");
}

/**
 * IPC arguments are whatever the page sent. These turn them into the type a
 * handler expects or refuse the call, with a bound on every string so nothing
 * unbounded reaches the disk or a provider.
 */
function textArgument(value: unknown, maxChars: number, what: string): string {
  if (typeof value !== "string") throw new Error(`${what} must be text.`);
  if (value.length > maxChars) throw new Error(`${what} is too long.`);
  return value;
}

function requiredText(value: unknown, maxChars: number, what: string): string {
  const text = textArgument(value, maxChars, what).trim();
  if (!text) throw new Error(`${what} is empty.`);
  return text;
}

/** A model tag. `runtime.ts` checks the shape; this bounds the input first. */
function tagArgument(value: unknown): string {
  return requiredText(value, 200, "The model name");
}

/** Document ids from the page: a bounded list of well-formed ids, or nothing. */
function documentIdsArgument(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("Documents must be a list.");
  if (value.length > LIMITS.documentsPerChat) throw new Error("Too many documents.");
  return value.map((entry) => localDocuments.assertDocumentId(entry));
}

function send(window: BrowserWindow | null, channel: string, payload: unknown): void {
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return;
  window.webContents.send(channel, payload);
}

function registerIpc(): void {
  // Only one of the two windows exists at a time, and a download started in
  // one is worth reporting to whichever is there now.
  const progress = (update: LocalProgress) => {
    send(workspace, "runtime:progress", update);
    send(local, "runtime:progress", update);
  };

  const handleFrom =
    (caller: Caller) =>
    <Args extends unknown[], Result>(
      channel: string,
      handler: (...args: Args) => Result | Promise<Result>,
    ) =>
      ipcMain.handle(channel, (event, ...args) => {
        assertTrusted(event, caller);
        return handler(...(args as Args));
      });
  const handle = handleFrom("server");
  const handleEither = handleFrom("either");
  const handleLocal = handleFrom("local");

  // The runtime is this computer's, so both windows may drive it.
  handleEither("runtime:status", () => runtime.status());
  handleEither("runtime:install", () => runtime.install(progress));
  handleEither("runtime:start", () => runtime.start());
  handleEither("runtime:models", () => runtime.models());
  handleEither("runtime:pull", (model: unknown) => runtime.pull(tagArgument(model), progress));
  handleEither("runtime:cancel", (model: unknown) => runtime.cancel(tagArgument(model)));
  handleEither("runtime:remove", (model: unknown) => runtime.remove(tagArgument(model)));
  handleEither("runtime:sharing", () => runtime.sharing());
  handleEither("runtime:setSharing", async (patch: unknown) => {
    const result = await runtime.setSharing(
      typeof patch === "object" && patch !== null ? patch : {},
    );
    syncLoginItem();
    return result;
  });
  // The server's own "change server" control. The form lives in the local
  // window now, so that is where it goes.
  handle("server:change", () => openLocal({ type: "change-server" }));

  registerLocalIpc(handleLocal);

  // Sign-in that has to happen in a real browser. The page proposes a path,
  // never a URL: the origin is the shell's to decide, so a page that has been
  // navigated somewhere unexpected cannot use this to launch arbitrary links.
  handle("server:openInBrowser", (path: string) => {
    const origin = serverOrigin;
    if (!origin) throw new Error("No server attached.");
    const target = new URL(String(path), origin);
    if (target.origin !== origin) throw new Error("Not a path on this server.");
    void shell.openExternal(target.toString());
  });
}

/**
 * What the local renderer may ask for. It is the shell's own page, and is
 * still treated as a page: every argument is checked here, the key it hands
 * over is never handed back, and chat ids are validated before they are
 * allowed anywhere near a file name (see local-store.ts).
 */
function registerLocalIpc(
  handle: <Args extends unknown[], Result>(
    channel: string,
    handler: (...args: Args) => Result | Promise<Result>,
  ) => void,
): void {
  const emit = (event: ChatStreamEvent) => send(local, "local:chats:event", event);

  handle("local:state", (): LocalState => {
    const settings = readSettings();
    const intent = pendingIntent;
    pendingIntent = null;
    return {
      platform: process.platform as LocalState["platform"],
      version: app.getVersion(),
      onboardingCompleted: settings.onboardingCompletedAt !== null,
      appearance: APPEARANCES.includes(settings.appearance) ? settings.appearance : "system",
      model: localModel.currentChoice(),
      suggestedServer: settings.serverUrl ?? settings.lastServerUrl ?? DEFAULT_SERVER,
      intent,
    };
  });

  handle("local:onboarding:complete", () => {
    // The first time is the one worth keeping; a replay does not move it.
    if (readSettings().onboardingCompletedAt === null) {
      writeSettings({ onboardingCompletedAt: new Date().toISOString() });
    }
  });

  handle("local:appearance:set", (appearance: unknown) => {
    if (!APPEARANCES.includes(appearance as Appearance)) throw new Error("Unknown appearance.");
    writeSettings({ appearance: appearance as Appearance });
    applyAppearance("local");
  });

  handle("local:model:useLocal", async (model: unknown) => {
    const tag = tagArgument(model);
    // Only a model that is on this disk can answer. Asking the runtime keeps
    // a stale button from saving a choice that fails on the first message.
    const installed = await runtime.models();
    if (!installed.some((candidate) => candidate.name === tag)) {
      throw new Error(`${tag} is not downloaded yet.`);
    }
    return localModel.useLocal(tag);
  });

  handle("local:model:useApiKey", async (input: unknown) => {
    const { provider, model, apiKey } = (
      typeof input === "object" && input !== null ? input : {}
    ) as Record<string, unknown>;
    if (!localModel.isApiProvider(provider)) throw new Error("Unknown provider.");
    const modelId = requiredText(model, 200, "The model");
    if (!localModel.isCatalogModel(provider, modelId)) throw new Error("Unknown model.");
    const key = requiredText(apiKey, LIMITS.apiKeyChars, "The API key");
    if (/\s/.test(key)) {
      throw new Error(
        `That does not look like a ${PROVIDERS[provider].label} key: it has a space or a line break in it.`,
      );
    }
    await localChat.validateApiKey(provider, modelId, key);
    return localModel.saveApiKey(provider, modelId, key);
  });

  handle("local:model:changeApiModel", (model: unknown) =>
    localModel.changeApiModel(requiredText(model, 200, "The model")),
  );
  handle("local:model:clear", () => localModel.clear());

  handle("local:chats:list", () => localStore.listChats());
  handle("local:chats:get", (id: unknown) => localStore.getChat(localStore.assertChatId(id)));
  handle("local:chats:rename", (id: unknown, title: unknown) =>
    localStore.renameChat(
      localStore.assertChatId(id),
      requiredText(title, LIMITS.titleChars, "The name"),
    ),
  );
  handle("local:chats:remove", (id: unknown) => {
    const chatId = localStore.assertChatId(id);
    localChat.cancel(chatId);
    localStore.removeChat(chatId);
  });
  handle("local:chats:send", (id: unknown, text: unknown, documentIds: unknown) =>
    localChat.send(
      id === null ? null : localStore.assertChatId(id),
      requiredText(text, LIMITS.messageChars, "The message"),
      documentIdsArgument(documentIds ?? []),
      emit,
    ),
  );
  handle("local:chats:attach", (id: unknown, documentIds: unknown) => {
    const adding = documentIdsArgument(documentIds);
    return localStore.setDocuments(localStore.assertChatId(id), (current) => [
      ...current,
      ...adding,
    ]);
  });
  handle("local:chats:detach", (id: unknown, documentId: unknown) => {
    const removing = localDocuments.assertDocumentId(documentId);
    return localStore.setDocuments(localStore.assertChatId(id), (current) =>
      current.filter((entry) => entry !== removing),
    );
  });

  handle("local:documents:list", () => localDocuments.listDocuments());
  // The paths come from the preload, which gets them from Electron for `File`
  // objects the person dropped or picked (`webUtils.getPathForFile`). They are
  // still checked one by one in local-documents.ts before anything is read.
  handle("local:documents:add", async (paths: unknown) => {
    if (!Array.isArray(paths) || paths.length === 0) throw new Error("No files were given.");
    if (paths.length > LIMITS.documentsPerCall) {
      throw new Error(`Add up to ${LIMITS.documentsPerCall} files at a time.`);
    }
    // One at a time: each file is read by a process of its own, and a drop of
    // twenty PDFs should not start twenty of them.
    const result: AddDocumentsResult = { documents: [], refused: [] };
    for (const path of paths) {
      try {
        result.documents.push(await localDocuments.addDocument(path));
      } catch (error) {
        // One unreadable file should not cost the person the other nineteen.
        result.refused.push(error instanceof Error ? error.message : String(error));
      }
    }
    return result;
  });
  handle("local:documents:remove", (id: unknown) =>
    localDocuments.removeDocument(localDocuments.assertDocumentId(id)),
  );
  handle("local:documents:storage", () => localDocuments.storage());

  // Neither takes anything from the page: which folder opens, and what is
  // checked, are the shell's to decide.
  handle("local:app:openDataFolder", async () => {
    const failure = await shell.openPath(app.getPath("userData"));
    if (failure) throw new Error("The folder could not be opened.");
  });
  handle("local:app:checkForUpdates", () => checkForUpdates(true));
  handle("local:chats:retry", (id: unknown) =>
    localChat.retry(localStore.assertChatId(id), emit),
  );
  handle("local:chats:cancel", (id: unknown) => localChat.cancel(localStore.assertChatId(id)));

  // On success the local window is replaced by the server's workspace.
  handle("local:server:connect", (address: unknown) =>
    attach(textArgument(address, LIMITS.addressChars, "The address")),
  );
  handle("local:server:retry", () => {
    const { serverUrl } = readSettings();
    if (!serverUrl) throw new Error("No server is saved. Enter its address.");
    return attach(serverUrl);
  });
}

/**
 * A machine that keeps serving should come back serving after a reboot, which
 * means the app has to come back too. Linux has no login-item API; there the
 * user adds the app to their session's autostart themselves.
 */
function syncLoginItem(): void {
  if (process.platform === "linux" || !app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: readSettings().runtime.keepRunning });
}

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { label: "Check for Updates…", click: () => void checkForUpdates(true) },
              { type: "separator" },
              { label: "Change Server…", click: () => openLocal({ type: "change-server" }) },
              { label: "Use Without a Server", click: () => useWithoutServer() },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : [
          {
            label: "File",
            submenu: [
              { label: "Change Server…", click: () => openLocal({ type: "change-server" }) },
              { label: "Use Without a Server", click: () => useWithoutServer() },
              { type: "separator" },
              { role: "quit" },
            ],
          } satisfies MenuItemConstructorOptions,
        ]),
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" } as const]),
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        // Also in the app menu on macOS, where people look for it first; here
        // for the platforms whose app menu does not exist.
        { label: "Check for Updates…", click: () => void checkForUpdates(true) },
        { type: "separator" },
        { label: "Release Notes", click: () => openExternal(RELEASES_PAGE) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** A launch is already deciding where to open; a second one should wait for it. */
let launching = false;

/**
 * With no saved server the app opens as itself: the local window, with the
 * first-run setup over it until that has been seen once.
 *
 * With one, the server is asked whether it is there before a window is pointed
 * at it. If it is not, the app opens anyway, in local mode, and says which
 * server did not answer. The address is kept: a laptop that is off the office
 * network today should find its workspace again tomorrow without being told.
 * The probe is short, because nothing is on screen while it runs.
 */
async function launch(): Promise<void> {
  if (launching) return;
  const { serverUrl } = readSettings();
  if (!serverUrl) {
    openLocal();
    return;
  }
  launching = true;
  try {
    await probeServer(serverUrl, 4000);
    openWorkspace(serverUrl);
  } catch {
    openLocal({ type: "unreachable", origin: serverUrl });
  } finally {
    launching = false;
  }
}

/** Brings the app to the front, from behind a browser or a minimised state. */
function focusApp(): void {
  const window = workspace ?? local;
  if (!window) {
    void launch();
    return;
  }
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  // The browser has focus at this point, so asking politely is not enough.
  if (isMac) app.focus({ steal: true });
}

/**
 * Tells the OS this app answers `onirix://`.
 *
 * Packaged builds declare it in their bundle (see `protocols` in
 * electron-builder.yml) and this confirms it at runtime. Unpackaged, the
 * executable is Electron itself, so the registration has to name the script
 * it should run or the OS would launch a bare Electron.
 */
function registerProtocol(): void {
  if (!process.defaultApp) {
    app.setAsDefaultProtocolClient(PROTOCOL);
    return;
  }
  const script = process.argv[1];
  if (script) app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [resolve(script)]);
}


// macOS delivers the link as an event, and can do so before the app is ready,
// so this listener goes on before anything else.
app.on("open-url", (event) => {
  event.preventDefault();
  if (app.isReady()) focusApp();
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // A second launch, which is what a browser opening `onirix://` looks like
  // on Windows and Linux. Either way the answer is the same: come forward.
  app.on("second-instance", () => focusApp());

  void app.whenReady().then(() => {
    registerProtocol();
    registerLocalProtocol();
    registerIpc();
    buildMenu();
    syncLoginItem();
    watchForUpdates();
    void runtime.resume();
    void launch();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void launch();
    });
  });

  app.on("window-all-closed", () => {
    if (!isMac) app.quit();
  });

  app.on("before-quit", () => runtime.stopOnQuit());
}
