// Renderer-facing typing for `window.api`. Mirrors the structure exposed by
// electron/preload.ts; keeps return types and complex-payload types stronger
// than the bridge layer, since renderer code is what reads them.
//
// Step 3 leaves payload shapes loose (most are `unknown` until Step 4 ports
// the domain types from QuickProp's reducer). Tighten in Step 4.

import type { LostReason, GenerateResult } from './domain';

export interface QuickQuoteApi {
  app: {
    /** One-shot mount call (QuickProp v3 `get_bootstrap`). */
    bootstrap(): Promise<unknown>;
  };

  identity: {
    get(): Promise<unknown | null>;
    set(email: string): Promise<unknown>;
    clear(): Promise<{ ok: true }>;
    listAllowed(): Promise<unknown[]>;
  };

  clientTemplates: {
    list(): Promise<string[]>;
    load(name: string): Promise<unknown>;
    save(name: string, fields: unknown): Promise<unknown>;
    remove(name: string): Promise<unknown>;
  };

  projectTemplates: {
    list(): Promise<string[]>;
    load(name: string): Promise<unknown>;
    save(name: string, sections: unknown[]): Promise<unknown>;
    remove(name: string): Promise<unknown>;
  };

  proposals: {
    list(): Promise<string[]>;
    load(name: string): Promise<unknown>;
    /** `renameFrom` is the prior on-disk name when renaming. */
    save(proposal: unknown, renameFrom?: string | null): Promise<{ ok: boolean; name: string; proposal: unknown }>;
    remove(name: string): Promise<{ ok: true }>;
  };

  lifecycle: {
    markSent(name: string, note?: string): Promise<unknown>;
    markWon(name: string, note?: string, icoreProjectId?: string | null): Promise<unknown>;
    markLost(name: string, reason: LostReason, note?: string): Promise<unknown>;
    markArchived(name: string, note?: string): Promise<unknown>;
    reopen(name: string, note?: string): Promise<unknown>;
    addNote(name: string, note: string): Promise<unknown>;
    reassign(name: string, newPmEmail: string, note?: string): Promise<unknown>;
    setFollowUp(name: string, whenIso: string | null, note?: string): Promise<unknown>;
  };

  versions: {
    create(name: string, note?: string): Promise<{ version: unknown; proposal: unknown }>;
    list(name: string): Promise<unknown[]>;
    load(name: string, version: number): Promise<unknown | null>;
  };

  dashboard: {
    get(opts?: { stale_days?: number; win_rate_window_days?: number; owner_email?: string }): Promise<unknown>;
  };

  generate: {
    docx(proposal: unknown): Promise<GenerateResult>;
    pdf(proposal: unknown, previewHtml?: string): Promise<GenerateResult>;
  };

  os: {
    openFile(path: string): Promise<{ ok: true }>;
    revealInExplorer(path: string): Promise<{ ok: true }>;
  };
}

declare global {
  interface Window {
    api: QuickQuoteApi;
  }
}
