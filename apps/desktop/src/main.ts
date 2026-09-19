/**
 * The Onirix desktop shell.
 *
 * A thin client: the window shows the web app served by an Onirix server the
 * user chose, exactly as a browser tab would, so there is one UI to build and
 * sign-in, permissions, and data all stay on the server. What the shell adds
 * is what a tab cannot have: a native window, and a local model runtime.
 *
 * Two windows exist, never both at once. The connect window is a local page
 * that asks which server to attach to. The workspace window is that server.
 */
import {
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
  app,
  ipcMain,
  nativeTheme,
  shell,
} from "electron";
import { join, resolve } from "node:path";

import type { LocalProgress } from "../../dashboard/src/lib/desktop";

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

let workspace: BrowserWindow | null = null;
let connect: BrowserWindow | null = null;

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
 * typo lands as a sentence on the connect screen rather than a blank window.
 */
async function probeServer(origin: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(8000) });
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

function openConnect(message?: string): void {
  workspace?.close();
  workspace = null;
  serverOrigin = null;

  if (connect) {
    connect.focus();
    return;
  }

  connect = new BrowserWindow({
    width: 480,
    height: 560,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: background(),
    titleBarStyle: isMac ? "hiddenInset" : "default",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "connect-preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  connect.once("ready-to-show", () => connect?.show());
  connect.on("closed", () => {
    connect = null;
  });
  void connect.loadFile(join(__dirname, "connect.html"), {
    query: {
      server: readSettings().serverUrl ?? DEFAULT_SERVER,
      ...(message ? { message } : {}),
    },
  });
}

function openWorkspace(origin: string): void {
  serverOrigin = origin;
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

  contents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    // -3 is an aborted load (a redirect, a second click), not a failure.
    if (!isMainFrame || code === -3) return;
    if (!sameOrigin(url, origin)) return;
    openConnect(`Could not load ${origin} (${description}).`);
  });

  // The public site is for visitors; the app opens on the product, which
  // sends anyone without a session to sign in.
  void window.loadURL(`${origin}/chat`);
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

/**
 * Runtime calls are honoured only from the top frame of the attached server.
 * The preload already withholds the bridge everywhere else; this is the check
 * that does not depend on the page being honest.
 */
function assertTrusted(event: Electron.IpcMainInvokeEvent): void {
  const frame = event.senderFrame;
  const trusted =
    frame !== null &&
    workspace !== null &&
    event.sender === workspace.webContents &&
    frame === workspace.webContents.mainFrame &&
    serverOrigin !== null &&
    sameOrigin(frame.url, serverOrigin);
  if (!trusted) throw new Error("Not allowed from this page.");
}

function registerIpc(): void {
  const progress = (update: LocalProgress) =>
    workspace?.webContents.send("runtime:progress", update);

  const handle = <Args extends unknown[], Result>(
    channel: string,
    handler: (...args: Args) => Result | Promise<Result>,
  ) =>
    ipcMain.handle(channel, (event, ...args) => {
      assertTrusted(event);
      return handler(...(args as Args));
    });

  handle("runtime:status", () => runtime.status());
  handle("runtime:install", () => runtime.install(progress));
  handle("runtime:start", () => runtime.start());
  handle("runtime:models", () => runtime.models());
  handle("runtime:pull", (model: string) => runtime.pull(String(model), progress));
  handle("runtime:cancel", (model: string) => runtime.cancel(String(model)));
  handle("runtime:remove", (model: string) => runtime.remove(String(model)));
  handle("runtime:sharing", () => runtime.sharing());
  handle("runtime:setSharing", async (patch: unknown) => {
    const result = await runtime.setSharing(
      typeof patch === "object" && patch !== null ? patch : {},
    );
    syncLoginItem();
    return result;
  });
  handle("server:change", () => openConnect());

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

  // The connect page is a local file the shell ships, and it can do one thing.
  ipcMain.handle("connect:submit", async (event, input: unknown) => {
    if (!connect || event.sender !== connect.webContents) {
      throw new Error("Not allowed from this page.");
    }
    const origin = await firstReachable(candidateOrigins(String(input)));
    writeSettings({ serverUrl: origin });
    openWorkspace(origin);
    connect.close();
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
              { label: "Change Server…", click: () => openConnect() },
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
              { label: "Change Server…", click: () => openConnect() },
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

function launch(): void {
  const { serverUrl } = readSettings();
  if (serverUrl) openWorkspace(serverUrl);
  else openConnect();
}

/** Brings the app to the front, from behind a browser or a minimised state. */
function focusApp(): void {
  const window = workspace ?? connect;
  if (!window) {
    launch();
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
    registerIpc();
    buildMenu();
    syncLoginItem();
    watchForUpdates();
    void runtime.resume();
    launch();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) launch();
    });
  });

  app.on("window-all-closed", () => {
    if (!isMac) app.quit();
  });

  app.on("before-quit", () => runtime.stopOnQuit());
}
