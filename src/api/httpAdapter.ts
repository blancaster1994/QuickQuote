/**
 * HTTP adapter — stub for the web port.
 *
 * Selected by `client.ts` when `VITE_API_BASE_URL` is set. Today this is
 * a skeleton: one endpoint (`proposals.list`) is wired end-to-end so future
 * Claude sessions have a concrete pattern; every other method throws
 * `NotImplemented`.
 *
 * Implementation order for the staff dev / next session (mirrors
 * `electron/ipc-channels.ts`):
 *   1. proposals.* + lifecycle.*
 *   2. lookups + employees + rates + bidItemTemplates
 *   3. project.* + clickup.*
 *   4. generate.* (Python CLI on Azure Function)
 *   5. versions + dashboard
 *   6. identity (handled mostly by MSAL; this just returns the current claims)
 *   7. os.* (download-link replacements; the Electron methods don't exist on web)
 *
 * Auth: every request must include `Authorization: Bearer <token>`. Use
 * `getAccessToken()` from `./msal` once that's wired.
 */

import type { QuickQuoteApi } from '../types/api';
import { getAccessToken } from './msal';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} on ${path}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const notImpl = (name: string) => () => {
  throw new Error(`httpAdapter.${name}: not implemented yet. See src/api/httpAdapter.ts.`);
};

export const httpAdapter: QuickQuoteApi = {
  app: {
    bootstrap: () => http('/app/bootstrap'),
    importFromQuickProp: notImpl('app.importFromQuickProp') as never,
  },

  identity: {
    get: () => http('/identity'),
    set: notImpl('identity.set') as never,
    clear: notImpl('identity.clear') as never,
    listAllowed: () => http('/identity/allowed'),
  },

  clientTemplates: {
    list: notImpl('clientTemplates.list') as never,
    load: notImpl('clientTemplates.load') as never,
    save: notImpl('clientTemplates.save') as never,
    remove: notImpl('clientTemplates.remove') as never,
  },

  projectTemplates: {
    list: notImpl('projectTemplates.list') as never,
    load: notImpl('projectTemplates.load') as never,
    save: notImpl('projectTemplates.save') as never,
    remove: notImpl('projectTemplates.remove') as never,
  },

  // ── EXEMPLAR: full implementation, copy this pattern for the rest. ────
  proposals: {
    list: () => http<string[]>('/proposals'),
    load: (name: string) => http(`/proposals/${encodeURIComponent(name)}`),
    save: (proposal: unknown, renameFrom?: string | null) =>
      http('/proposals', {
        method: 'POST',
        body: JSON.stringify({ proposal, renameFrom: renameFrom ?? null }),
      }),
    remove: (name: string) =>
      http(`/proposals/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  },
  // ─────────────────────────────────────────────────────────────────────

  lifecycle: {
    markSent: notImpl('lifecycle.markSent') as never,
    markWon: notImpl('lifecycle.markWon') as never,
    markLost: notImpl('lifecycle.markLost') as never,
    markArchived: notImpl('lifecycle.markArchived') as never,
    reopen: notImpl('lifecycle.reopen') as never,
    addNote: notImpl('lifecycle.addNote') as never,
    reassign: notImpl('lifecycle.reassign') as never,
    setFollowUp: notImpl('lifecycle.setFollowUp') as never,
    sendAndInitialize: notImpl('lifecycle.sendAndInitialize') as never,
    markWonAndSync: notImpl('lifecycle.markWonAndSync') as never,
  },

  versions: {
    create: notImpl('versions.create') as never,
    list: notImpl('versions.list') as never,
    load: notImpl('versions.load') as never,
  },

  dashboard: {
    get: notImpl('dashboard.get') as never,
  },

  generate: {
    docx: notImpl('generate.docx') as never,
    pdf: notImpl('generate.pdf') as never,
  },

  os: {
    // No native equivalents on web. These should return blob download URLs
    // (SAS) or be removed at the renderer call site.
    openFile: notImpl('os.openFile') as never,
    revealInExplorer: notImpl('os.revealInExplorer') as never,
    copyFileToClipboard: notImpl('os.copyFileToClipboard') as never,
  },

  dialog: {
    // Web alternative: use an <input type="file"> in the renderer instead
    // of an IPC call. Remove from renderer at the call site when porting.
    openFile: notImpl('dialog.openFile') as never,
  },

  lookups: {
    list: notImpl('lookups.list') as never,
    add: notImpl('lookups.add') as never,
    update: notImpl('lookups.update') as never,
    remove: notImpl('lookups.remove') as never,
  },

  markup: {
    list: notImpl('markup.list') as never,
    add: notImpl('markup.add') as never,
    update: notImpl('markup.update') as never,
    remove: notImpl('markup.remove') as never,
  },

  phases: {
    list: notImpl('phases.list') as never,
    save: notImpl('phases.save') as never,
    remove: notImpl('phases.remove') as never,
  },

  tasks: {
    list: notImpl('tasks.list') as never,
    save: notImpl('tasks.save') as never,
    remove: notImpl('tasks.remove') as never,
  },

  bidItemTemplates: {
    list: notImpl('bidItemTemplates.list') as never,
    get: notImpl('bidItemTemplates.get') as never,
    save: notImpl('bidItemTemplates.save') as never,
    remove: notImpl('bidItemTemplates.remove') as never,
    rename: notImpl('bidItemTemplates.rename') as never,
  },

  employees: {
    list: notImpl('employees.list') as never,
    save: notImpl('employees.save') as never,
    remove: notImpl('employees.remove') as never,
    importBulk: notImpl('employees.importBulk') as never,
    findByEmail: notImpl('employees.findByEmail') as never,
  },

  rates: {
    list: notImpl('rates.list') as never,
    save: notImpl('rates.save') as never,
    remove: notImpl('rates.remove') as never,
    importBulk: notImpl('rates.importBulk') as never,
    lookup: notImpl('rates.lookup') as never,
    categories: notImpl('rates.categories') as never,
    tablesForEntity: notImpl('rates.tablesForEntity') as never,
  },

  clickup: {
    getConfig: notImpl('clickup.getConfig') as never,
    setConfig: notImpl('clickup.setConfig') as never,
    testConnection: notImpl('clickup.testConnection') as never,
    preflight: notImpl('clickup.preflight') as never,
    send: notImpl('clickup.send') as never,
    getLink: notImpl('clickup.getLink') as never,
    listPhaseLinks: notImpl('clickup.listPhaseLinks') as never,
    unlink: notImpl('clickup.unlink') as never,
  },

  project: {
    initialize: notImpl('project.initialize') as never,
    get: notImpl('project.get') as never,
    getByProposalName: notImpl('project.getByProposalName') as never,
    list: notImpl('project.list') as never,
    updateHeader: notImpl('project.updateHeader') as never,
    savePayload: notImpl('project.savePayload') as never,
    reassignPm: notImpl('project.reassignPm') as never,
  },
};
