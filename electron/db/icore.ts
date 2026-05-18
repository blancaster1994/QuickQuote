// iCore (Dynamics 365 F&O) integration — DB-side config CRUD.
//
// Structurally mirrors electron/db/clickup.ts (the established external-system
// pattern in QuickQuote). The schema for icore_config + icore_client cache +
// the project_icore_link / project_icore_phase_link tables landed in
// migration v5 (electron/db/schema.ts). This module owns the config
// singleton getter/setter — the cache CRUD and link CRUD will be added in
// the next slice alongside the actual sync code.
//
// Renderer never sees the full row directly; main.ts wraps reads in a
// sanitized IcoreStatus shape. Today there's no secret to strip — the
// tenant/client/env URL are non-secret app-registration metadata — but
// keeping the renderer on a smaller surface area means we can add a real
// secret (cached token, refresh token) later without changing the
// renderer-facing type.

import type Database from 'better-sqlite3';

export interface IcoreConfigRow {
  tenant_id: string | null;
  client_id: string | null;
  environment_url: string | null;
  deeplink_url_pattern: string | null;
  enabled: boolean;
  client_sync_interval_minutes: number;
  client_last_synced_at: string | null;
  updated_at: string | null;
}

const EMPTY: IcoreConfigRow = {
  tenant_id: null,
  client_id: null,
  environment_url: null,
  deeplink_url_pattern: null,
  enabled: false,
  client_sync_interval_minutes: 60,
  client_last_synced_at: null,
  updated_at: null,
};

export function getIcoreConfig(db: Database.Database): IcoreConfigRow {
  const row = db
    .prepare(`
      SELECT tenant_id, client_id, environment_url, deeplink_url_pattern,
             enabled, client_sync_interval_minutes, client_last_synced_at,
             updated_at
      FROM icore_config WHERE key='singleton'
    `)
    .get() as
    | (Omit<IcoreConfigRow, 'enabled'> & { enabled: number })
    | undefined;
  if (!row) return { ...EMPTY };
  return { ...row, enabled: !!row.enabled };
}

export function setIcoreConfig(
  db: Database.Database,
  patch: Partial<IcoreConfigRow>,
): IcoreConfigRow {
  const cur = getIcoreConfig(db);
  const next: IcoreConfigRow = { ...cur, ...patch };
  db.prepare(`
    REPLACE INTO icore_config(
      key, tenant_id, client_id, environment_url, deeplink_url_pattern,
      enabled, client_sync_interval_minutes, client_last_synced_at,
      updated_at
    ) VALUES ('singleton', ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    next.tenant_id,
    next.client_id,
    next.environment_url,
    next.deeplink_url_pattern,
    next.enabled ? 1 : 0,
    next.client_sync_interval_minutes,
    next.client_last_synced_at,
  );
  return getIcoreConfig(db);
}
