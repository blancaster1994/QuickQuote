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
    /** One-time data import from QuickProp v3 — copies proposals,
     *  templates, and identity over. Idempotent via schema_meta marker. */
    importFromQuickProp: (sourceDir?: string) =>
      ipcRenderer.invoke('app:importFromQuickProp', sourceDir ?? null),
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
    /** Mark Sent + create the project in one transaction. Returns
     *  { proposal, project }. Throws if legal_entity / department aren't
     *  set on the proposal. */
    sendAndInitialize: (payload: {
      proposalName: string;
      rateTableOverride?: string | null;
      icoreProjectId?: string | null;
      note?: string;
    }) => ipcRenderer.invoke('lifecycle:sendAndInitialize', payload),
    /** Mark Won + stamp the iCore project ID on the project row. Returns
     *  { proposal, project }. */
    markWonAndSync: (payload: {
      proposalName: string;
      icoreProjectId: string;
    }) => ipcRenderer.invoke('lifecycle:markWonAndSync', payload),
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
    openFile:             (path: string) => ipcRenderer.invoke('os:openFile', path),
    revealInExplorer:     (path: string) => ipcRenderer.invoke('os:revealInExplorer', path),
    copyFileToClipboard:  (path: string) => ipcRenderer.invoke('os:copyFileToClipboard', path),
  },

  // ── PM-mode admin (Stage 2) ───────────────────────────────────────────────
  // Method names follow PM Quoting App's conventions (`remove`, `importBulk`)
  // so the editor ports work without a rename. The underlying channel strings
  // come from electron/ipc-channels.ts (`*_DELETE`, `*_BULK_REPLACE`).

  /** Native open-file dialog (XLSX import for lookups admin). */
  dialog: {
    openFile: (filters?: Array<{ name: string; extensions: string[] }>) =>
      ipcRenderer.invoke('dialog:openFile', filters),
  },

  /** Simple name-list CRUD keyed by table name. */
  lookups: {
    list:   (table: string) => ipcRenderer.invoke('lookup:list', table),
    add:    (table: string, name: string) => ipcRenderer.invoke('lookup:add', table, name),
    update: (table: string, id: number, name: string) =>
      ipcRenderer.invoke('lookup:update', table, id, name),
    remove: (table: string, id: number) => ipcRenderer.invoke('lookup:delete', table, id),
  },

  /** Markup percentages (numeric value list). */
  markup: {
    list:   () => ipcRenderer.invoke('markup:list'),
    add:    (value: number) => ipcRenderer.invoke('markup:add', value),
    update: (id: number, value: number) => ipcRenderer.invoke('markup:update', id, value),
    remove: (id: number) => ipcRenderer.invoke('markup:delete', id),
  },

  /** Department-scoped phase taxonomy. */
  phases: {
    list:   (department?: string) => ipcRenderer.invoke('phaseDef:list', department),
    save:   (row: any) => ipcRenderer.invoke('phaseDef:save', row),
    remove: (id: number) => ipcRenderer.invoke('phaseDef:delete', id),
  },

  /** (department, phase)-scoped task taxonomy. */
  tasks: {
    list:   (department?: string, phase?: string) =>
      ipcRenderer.invoke('taskDef:list', department, phase),
    save:   (row: any) => ipcRenderer.invoke('taskDef:save', row),
    remove: (id: number) => ipcRenderer.invoke('taskDef:delete', id),
  },

  /** Bid item templates — phases (with nested name-only tasks) scoped per
   *  (legal_entity, department). Applied in the proposal editor; replaces
   *  the legacy `templates.*` (template_phase) API. */
  bidItemTemplates: {
    list: (legalEntity: string, department: string) =>
      ipcRenderer.invoke('bidItemTemplate:list', legalEntity, department),
    get: (legalEntity: string, department: string, name: string) =>
      ipcRenderer.invoke('bidItemTemplate:get', legalEntity, department, name),
    save: (template: any) => ipcRenderer.invoke('bidItemTemplate:save', template),
    remove: (legalEntity: string, department: string, name: string) =>
      ipcRenderer.invoke('bidItemTemplate:delete', legalEntity, department, name),
    rename: (legalEntity: string, department: string, oldName: string, newName: string) =>
      ipcRenderer.invoke('bidItemTemplate:rename', legalEntity, department, oldName, newName),
  },

  /** Employees (extended). */
  employees: {
    list:        (activeOnly?: boolean) => ipcRenderer.invoke('employee:list', activeOnly),
    save:        (row: any) => ipcRenderer.invoke('employee:save', row),
    remove:      (id: number) => ipcRenderer.invoke('employee:delete', id),
    importBulk:  (rows: any[]) => ipcRenderer.invoke('employee:importBulk', rows),
    findByEmail: (email: string) => ipcRenderer.invoke('employee:findByEmail', email),
  },

  /** Rates (4-tier lookup). */
  rates: {
    list:             (filters?: any) => ipcRenderer.invoke('rate:list', filters),
    save:             (row: any) => ipcRenderer.invoke('rate:save', row),
    remove:           (id: number) => ipcRenderer.invoke('rate:delete', id),
    importBulk:       (rows: any[]) => ipcRenderer.invoke('rate:importBulk', rows),
    lookup:           (legalEntity: string, rateTable: string, category: string, resourceId?: string | null) =>
      ipcRenderer.invoke('rate:lookup', legalEntity, rateTable, category, resourceId ?? null),
    categories:       (legalEntity?: string) => ipcRenderer.invoke('rate:categories', legalEntity),
    tablesForEntity:  (legalEntity: string) => ipcRenderer.invoke('rate:tablesForEntity', legalEntity),
  },

  /** ClickUp settings + sync. `getConfig` returns a sanitized status object —
   *  the api_token is intentionally never sent to the renderer. preflight /
   *  send drive the two-phase send flow shown in SendToClickUpModal. */
  clickup: {
    getConfig:       () => ipcRenderer.invoke('clickup:getConfig'),
    setConfig:       (patch: any) => ipcRenderer.invoke('clickup:setConfig', patch),
    testConnection:  () => ipcRenderer.invoke('clickup:testConnection'),
    preflight:       (projectId: number) => ipcRenderer.invoke('clickup:preflight', projectId),
    send:            (projectId: number, decisions: any) =>
      ipcRenderer.invoke('clickup:send', projectId, decisions),
    getLink:         (projectId: number) => ipcRenderer.invoke('clickup:getLink', projectId),
    listPhaseLinks:  (projectId: number) => ipcRenderer.invoke('clickup:listPhaseLinks', projectId),
    unlink:          (projectId: number) => ipcRenderer.invoke('clickup:unlink', projectId),
  },

  /** Project mode (Stage 4). Per-Won-proposal record holding entity /
   *  department / PM / iCore + the editable phases + resources payload.
   *  Renderer addresses by proposal name (consistent with lifecycle.*). */
  project: {
    /** Create the project row from the Won proposal. Throws if one already
     *  exists — caller should call getByProposalName first to detect that
     *  case and route to "open existing" UX. */
    initialize: (payload: any) => ipcRenderer.invoke('project:initialize', payload),
    get:               (id: number) => ipcRenderer.invoke('project:get', id),
    getByProposalName: (proposalName: string) => ipcRenderer.invoke('project:getByProposalName', proposalName),
    list:              (filters?: any) => ipcRenderer.invoke('project:list', filters),
    updateHeader:      (id: number, patch: any) => ipcRenderer.invoke('project:updateHeader', id, patch),
    savePayload:       (id: number, payload: any) => ipcRenderer.invoke('project:savePayload', id, payload),
    reassignPm:        (id: number, newEmail: string, newName: string) =>
      ipcRenderer.invoke('project:reassignPm', id, newEmail, newName),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
