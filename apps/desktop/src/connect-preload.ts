/** The connect screen can do exactly one thing: propose a server address. */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("onirixConnect", {
  submit: (server: string): Promise<void> => ipcRenderer.invoke("connect:submit", server),
});
