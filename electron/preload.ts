import { contextBridge, ipcRenderer } from 'electron';

// QuickQuote renderer-facing API. Populated as IPC handlers are added in
// later steps. For now, exposes a tiny ping/version so the renderer can
// confirm the contextBridge wiring works end-to-end.
//
// IMPORTANT: sandboxed preload cannot require relative modules. Channel
// names are inlined here. Keep in sync with ./ipc-channels.ts.

const api = {
  ping: () => ipcRenderer.invoke('app:ping'),
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
