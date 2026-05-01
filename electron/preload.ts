import { contextBridge, ipcRenderer } from 'electron';

// QuickQuote IPC bridge. Exposes window.api with one namespace per JsApi
// area in QuickProp v3.1.1 (QuickProp/quickprop/api.py).
//
// Method names use lowerCamelCase to match TS conventions; the v3 Python
// snake_case names are documented in the JSDoc comments.
//
// IMPORTANT: sandboxed preload cannot require relative modules, so the
// channel name strings are inlined here. Keep them in sync with
// ./ipc-channels.ts (single source of truth for the channel names).
//
// Complex payloads are typed `any` at the bridge layer — the renderer-side
// surface in src/types/api.d.ts carries the strong types. This matches PM
// Quoting App's pattern.

const api = {
  // ── bootstrap ─────────────────────────────────────────────────────────────
  app: {
    /** One-shot mount-time call (was `get_bootstrap`). */
    bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  },

  // ── identity ──────────────────────────────────────────────────────────────
  identity: {
    get: () => ipcRenderer.invoke('identity:get'),
    set: (email: string) => ipcRenderer.invoke('identity:set', email),
    clear: () => ipcRenderer.invoke('identity:clear'),
    listAllowed: () => ipcRenderer.invoke('identity:listAllowed'),
  },

  // ── client templates (per-engineer) ───────────────────────────────────────
  clientTemplates: {
    list: () => ipcRenderer.invoke('clientTemplate:list'),
    load: (name: string) => ipcRenderer.invoke('clientTemplate:load', name),
    save: (name: string, fields: any) => ipcRenderer.invoke('clientTemplate:save', name, fields),
    remove: (name: string) => ipcRenderer.invoke('clientTemplate:delete', name),
  },

  // ── project (scope) templates (per-engineer) ─────────────────────────────
  projectTemplates: {
    list: () => ipcRenderer.invoke('projectTemplate:list'),
    load: (name: string) => ipcRenderer.invoke('projectTemplate:load', name),
    save: (name: string, sections: any[]) => ipcRenderer.invoke('projectTemplate:save', name, sections),
    remove: (name: string) => ipcRenderer.invoke('projectTemplate:delete', name),
  },

  // ── proposal CRUD ─────────────────────────────────────────────────────────
  proposals: {
    list: () => ipcRenderer.invoke('proposal:list'),
    load: (name: string) => ipcRenderer.invoke('proposal:load', name),
    /** `renameFrom` is the prior on-disk name when renaming during save. */
    save: (proposal: any, renameFrom?: string | null) =>
      ipcRenderer.invoke('proposal:save', proposal, renameFrom ?? null),
    remove: (name: string) => ipcRenderer.invoke('proposal:delete', name),
  },

  // ── lifecycle transitions ─────────────────────────────────────────────────
  lifecycle: {
    markSent:     (name: string, note?: string) =>
      ipcRenderer.invoke('lifecycle:markSent', name, note ?? ''),
    markWon:      (name: string, note?: string, icoreProjectId?: string | null) =>
      ipcRenderer.invoke('lifecycle:markWon', name, note ?? '', icoreProjectId ?? null),
    markLost:     (name: string, reason: string, note?: string) =>
      ipcRenderer.invoke('lifecycle:markLost', name, reason, note ?? ''),
    markArchived: (name: string, note?: string) =>
      ipcRenderer.invoke('lifecycle:markArchived', name, note ?? ''),
    reopen:       (name: string, note?: string) =>
      ipcRenderer.invoke('lifecycle:reopen', name, note ?? ''),
    addNote:      (name: string, note: string) =>
      ipcRenderer.invoke('lifecycle:addNote', name, note),
    reassign:     (name: string, newPmEmail: string, note?: string) =>
      ipcRenderer.invoke('lifecycle:reassign', name, newPmEmail, note ?? ''),
    setFollowUp:  (name: string, whenIso: string | null, note?: string) =>
      ipcRenderer.invoke('lifecycle:setFollowUp', name, whenIso, note ?? ''),
  },

  // ── versioning (snapshots) ────────────────────────────────────────────────
  versions: {
    create: (name: string, note?: string) =>
      ipcRenderer.invoke('version:create', name, note ?? ''),
    list: (name: string) => ipcRenderer.invoke('version:list', name),
    load: (name: string, version: number) =>
      ipcRenderer.invoke('version:load', name, version),
  },

  // ── dashboard ─────────────────────────────────────────────────────────────
  dashboard: {
    get: (opts?: { stale_days?: number; win_rate_window_days?: number; owner_email?: string }) =>
      ipcRenderer.invoke('dashboard:get', opts ?? {}),
  },

  // ── proposal generation (spawns Python CLI in Step 7) ────────────────────
  generate: {
    docx: (proposal: any) => ipcRenderer.invoke('generate:docx', proposal),
    pdf:  (proposal: any, previewHtml?: string) =>
      ipcRenderer.invoke('generate:pdf', proposal, previewHtml ?? ''),
  },

  // ── OS integration ────────────────────────────────────────────────────────
  os: {
    openFile:         (path: string) => ipcRenderer.invoke('os:openFile', path),
    revealInExplorer: (path: string) => ipcRenderer.invoke('os:revealInExplorer', path),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
