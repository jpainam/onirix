/**
 * The local window's preload: publishes `window.onirixLocal`.
 *
 * The local window only ever shows the renderer the shell ships, served from
 * its own scheme, and it is not allowed to navigate anywhere else. The origin
 * is still checked here, and again in the main process on every call, so the
 * bridge does not depend on that staying true.
 */
import { contextBridge, ipcRenderer, webUtils } from "electron";

import type { ChatStreamEvent, LocalBridge, LocalProgress, ShellIntent } from "./local-bridge";

/** Must match `LOCAL_ORIGIN` in main.ts. */
const LOCAL_ORIGIN = "onirix-app://local";

function subscribe<Payload>(channel: string, listener: (payload: Payload) => void): () => void {
  const forward = (_event: unknown, payload: Payload) => listener(payload);
  ipcRenderer.on(channel, forward);
  return () => ipcRenderer.removeListener(channel, forward);
}

if (window.location.origin === LOCAL_ORIGIN) {
  const bridge: LocalBridge = {
    state: () => ipcRenderer.invoke("local:state"),
    onboarding: {
      complete: () => ipcRenderer.invoke("local:onboarding:complete"),
    },
    appearance: {
      set: (appearance) => ipcRenderer.invoke("local:appearance:set", appearance),
    },
    model: {
      useLocal: (model) => ipcRenderer.invoke("local:model:useLocal", model),
      useApiKey: (input) => ipcRenderer.invoke("local:model:useApiKey", input),
      changeApiModel: (model) => ipcRenderer.invoke("local:model:changeApiModel", model),
      clear: () => ipcRenderer.invoke("local:model:clear"),
    },
    chats: {
      list: () => ipcRenderer.invoke("local:chats:list"),
      get: (id) => ipcRenderer.invoke("local:chats:get", id),
      rename: (id, title) => ipcRenderer.invoke("local:chats:rename", id, title),
      remove: (id) => ipcRenderer.invoke("local:chats:remove", id),
      send: (chatId, text, documentIds) =>
        ipcRenderer.invoke("local:chats:send", chatId, text, documentIds ?? []),
      attach: (chatId, documentIds) => ipcRenderer.invoke("local:chats:attach", chatId, documentIds),
      detach: (chatId, documentId) => ipcRenderer.invoke("local:chats:detach", chatId, documentId),
      retry: (chatId) => ipcRenderer.invoke("local:chats:retry", chatId),
      cancel: (chatId) => ipcRenderer.invoke("local:chats:cancel", chatId),
      onEvent: (listener) => subscribe<ChatStreamEvent>("local:chats:event", listener),
    },
    documents: {
      list: () => ipcRenderer.invoke("local:documents:list"),
      // The page hands over `File` objects, and where each one lives is asked
      // of Electron here, on this side of the bridge. A path therefore only
      // ever exists for a file the person dropped or picked: the page has no
      // way to name one, so it cannot ask for `~/.ssh/id_rsa` to be "added".
      add: (files) =>
        ipcRenderer.invoke(
          "local:documents:add",
          Array.from(files, (file) => webUtils.getPathForFile(file)).filter(Boolean),
        ),
      remove: (id) => ipcRenderer.invoke("local:documents:remove", id),
      storage: () => ipcRenderer.invoke("local:documents:storage"),
    },
    skills: {
      list: () => ipcRenderer.invoke("local:skills:list"),
      create: (draft) => ipcRenderer.invoke("local:skills:create", draft),
      update: (id, draft) => ipcRenderer.invoke("local:skills:update", id, draft),
      reset: (id) => ipcRenderer.invoke("local:skills:reset", id),
      remove: (id) => ipcRenderer.invoke("local:skills:remove", id),
    },
    app: {
      openDataFolder: () => ipcRenderer.invoke("local:app:openDataFolder"),
      checkForUpdates: () => ipcRenderer.invoke("local:app:checkForUpdates"),
    },
    server: {
      connect: (address) => ipcRenderer.invoke("local:server:connect", address),
      retry: () => ipcRenderer.invoke("local:server:retry"),
    },
    shell: {
      onIntent: (listener) => subscribe<ShellIntent>("local:shell:intent", listener),
    },
    runtime: {
      status: () => ipcRenderer.invoke("runtime:status"),
      install: () => ipcRenderer.invoke("runtime:install"),
      start: () => ipcRenderer.invoke("runtime:start"),
      models: () => ipcRenderer.invoke("runtime:models"),
      pull: (model) => ipcRenderer.invoke("runtime:pull", model),
      cancel: (model) => ipcRenderer.invoke("runtime:cancel", model),
      remove: (model) => ipcRenderer.invoke("runtime:remove", model),
      onProgress: (listener) => subscribe<LocalProgress>("runtime:progress", listener),
    },
  };
  contextBridge.exposeInMainWorld("onirixLocal", bridge);

  // The same classes the server window gets (see preload.ts): globals.css keys
  // the traffic-light offsets and the drag regions on them, and they have to
  // be on <html> before first paint, which is before it exists.
  //
  // The theme is set here for the same reason. The main process applies the
  // person's choice to `nativeTheme`, which is what this media query reports,
  // so following the query follows the setting, and "system" needs no case of
  // its own.
  const dark = window.matchMedia("(prefers-color-scheme: dark)");
  const paint = () => {
    document.documentElement?.classList.toggle("dark", dark.matches);
  };
  dark.addEventListener("change", paint);

  const mark = () => {
    const root = document.documentElement;
    if (!root) return false;
    root.classList.add("onirix-desktop", `onirix-desktop-${process.platform}`);
    paint();
    return true;
  };
  if (!mark()) {
    const observer = new MutationObserver(() => {
      if (mark()) observer.disconnect();
    });
    observer.observe(document, { childList: true });
  }
}
