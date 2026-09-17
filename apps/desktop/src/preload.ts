/**
 * The workspace window's preload: publishes `window.onirixDesktop`.
 *
 * The window can travel (a sign-in provider and back), and this script runs on
 * every page it loads. The bridge is therefore published only on the attached
 * server's own origin, and the main process checks the sender again on every
 * call, so a page elsewhere gets neither the object nor an answer.
 */
import { contextBridge, ipcRenderer } from "electron";

import type {
  DesktopBridge,
  DesktopPlatform,
  LocalProgress,
} from "../../web/src/lib/desktop";

/** Values the main process hands over as `--name=value` arguments. */
function argument(name: string): string {
  const flag = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(flag))?.slice(flag.length) ?? "";
}

const origin = argument("onirix-server");

if (origin && window.location.origin === origin) {
  const bridge: DesktopBridge = {
    platform: process.platform as DesktopPlatform,
    version: argument("onirix-version"),
    server: {
      origin,
      change: () => ipcRenderer.invoke("server:change"),
    },
    runtime: {
      status: () => ipcRenderer.invoke("runtime:status"),
      install: () => ipcRenderer.invoke("runtime:install"),
      start: () => ipcRenderer.invoke("runtime:start"),
      models: () => ipcRenderer.invoke("runtime:models"),
      pull: (model) => ipcRenderer.invoke("runtime:pull", model),
      cancel: (model) => ipcRenderer.invoke("runtime:cancel", model),
      remove: (model) => ipcRenderer.invoke("runtime:remove", model),
      sharing: () => ipcRenderer.invoke("runtime:sharing"),
      setSharing: (patch) => ipcRenderer.invoke("runtime:setSharing", patch),
      onProgress: (listener) => {
        const forward = (_event: unknown, progress: LocalProgress) => listener(progress);
        ipcRenderer.on("runtime:progress", forward);
        return () => ipcRenderer.removeListener("runtime:progress", forward);
      },
    },
  };
  contextBridge.exposeInMainWorld("onirixDesktop", bridge);

  // The web app reserves room for the window controls from CSS alone, so the
  // class has to be on <html> before first paint, which is before it exists.
  const mark = () => {
    const root = document.documentElement;
    if (!root) return false;
    root.classList.add("onirix-desktop", `onirix-desktop-${process.platform}`);
    return true;
  };
  if (!mark()) {
    const observer = new MutationObserver(() => {
      if (mark()) observer.disconnect();
    });
    observer.observe(document, { childList: true });
  }
}
